import {
  ERROR_CODES,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_MAX_PARTICIPANTS,
  type AvatarIdUpdatedPayload,
  type DisplayNameUpdatedPayload,
  type OwnerChangedPayload,
  type ParamBatchPayload,
  type ParamValue,
  type Participant,
  type ParticipantLeaveReason,
  type ParticipantLeftPayload,
  type RoomJoinedPayload,
  type RoomSettings,
  type RoomSettingsUpdatedPayload
} from '../../../shared/src/index.ts'
import { mergeSettings, normalizeParams, generateRoomCodeCandidate } from './room-helpers.ts'
import { RoomManagerError } from './room-errors.ts'
import type { RedisClient } from './redis-client.ts'
import { redisKeys, hashGetAll, hashGet, hashKeys, sortedRange, stringGet } from './redis-client.ts'
import type { HandleParamBatchResult, LeaveRoomResult } from './room-types.ts'
import { ParamRateTracker } from './param-rate-tracker.ts'

export class RoomManager {
  private readonly paramRateTracker = new ParamRateTracker()

  constructor(private readonly redis: RedisClient) { }

  async createRoom(sessionId: string, displayName: string, requestedSettings?: Partial<RoomSettings>): Promise<RoomJoinedPayload> {
    await this.ensureSessionNotInRoom(sessionId)

    const roomCode = await this.generateRoomCode()
    const settings = mergeSettings(requestedSettings)
    const now = Date.now()
    const participant: Participant = { sessionId, displayName, joinedAt: now, connected: true, avatarId: null }

    const multi = this.redis.multi()

    multi.hSet(redisKeys.room(roomCode), {
      roomCode,
      ownerSessionId: sessionId,
      createdAt: String(now),
      autoOwnerEnabled: settings.autoOwnerEnabled ? '1' : '0',
      instantOwnerTakeoverEnabled: settings.instantOwnerTakeoverEnabled ? '1' : '0',
      filterMode: settings.filterMode,
      filterPaths: JSON.stringify(settings.filterPaths),
      participantCount: '1',
      ownerAvatarId: ''
    })

    multi.hSet(redisKeys.participants(roomCode), sessionId, JSON.stringify(participant))
    multi.zAdd(redisKeys.joinOrder(roomCode), { score: now, value: sessionId })
    multi.set(redisKeys.displayName(roomCode, displayName), sessionId)

    multi.hSet(redisKeys.session(sessionId), {
      sessionId,
      displayName,
      roomCode,
      joinedAt: String(now),
      connected: '1',
      lastSeenAt: String(now)
    })

    await multi.exec()

    return {
      roomCode,
      selfSessionId: sessionId,
      ownerSessionId: sessionId,
      settings,
      participants: [participant],
      snapshot: [],
      ownerAvatarId: null
    }
  }

  async joinRoom(sessionId: string, displayName: string, rawRoomCode: string): Promise<RoomJoinedPayload> {
    await this.ensureSessionNotInRoom(sessionId)

    const roomCode = normalizeRoomCode(rawRoomCode)
    if (!isValidRoomCode(roomCode)) {
      throw new RoomManagerError(ERROR_CODES.invalidRoomCode, 'Room code format is invalid.')
    }

    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (!roomMeta.roomCode) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    const participantCount = parseInt(roomMeta.participantCount, 10)
    if (participantCount >= ROOM_MAX_PARTICIPANTS) {
      throw new RoomManagerError(ERROR_CODES.roomFull, 'Room is full.')
    }

    const existingHolder = await stringGet(this.redis, redisKeys.displayName(roomCode, displayName))
    if (existingHolder) {
      throw new RoomManagerError(ERROR_CODES.displayNameInUse, 'Display name is already in use in this room.')
    }

    const now = Date.now()
    const participant: Participant = { sessionId, displayName, joinedAt: now, connected: true, avatarId: null }

    const multi = this.redis.multi()

    multi.hSet(redisKeys.participants(roomCode), sessionId, JSON.stringify(participant))
    multi.zAdd(redisKeys.joinOrder(roomCode), { score: now, value: sessionId })
    multi.set(redisKeys.displayName(roomCode, displayName), sessionId)
    multi.hSet(redisKeys.room(roomCode), 'participantCount', String(participantCount + 1))

    multi.hSet(redisKeys.session(sessionId), {
      sessionId,
      displayName,
      roomCode,
      joinedAt: String(now),
      connected: '1',
      lastSeenAt: String(now)
    })

    await multi.exec()

    return await this.buildRoomJoinedPayload(roomCode, sessionId)
  }

  async leaveRoom(sessionId: string, reason: ParticipantLeaveReason): Promise<LeaveRoomResult> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode

    const participantJson = await hashGet(this.redis, redisKeys.participants(roomCode), sessionId)
    if (!participantJson) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Participant not found in room.')
    }

    const participant = JSON.parse(participantJson) as Participant
    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    const participantCount = parseInt(roomMeta.participantCount, 10) - 1

    const leftPayload: ParticipantLeftPayload = {
      roomCode,
      sessionId,
      displayName: participant.displayName,
      reason
    }

    if (participantCount <= 0) {
      const multi = this.redis.multi()
      multi.del(redisKeys.room(roomCode))
      multi.del(redisKeys.participants(roomCode))
      multi.del(redisKeys.joinOrder(roomCode))
      multi.del(redisKeys.state(roomCode))
      multi.del(redisKeys.displayName(roomCode, participant.displayName))
      multi.del(redisKeys.session(sessionId))
      await multi.exec()

      this.paramRateTracker.pruneRoom(roomCode)

      return { leftPayload, roomCode, deletedRoom: true }
    }

    let ownerChangedPayload: OwnerChangedPayload | undefined

    if (roomMeta.ownerSessionId === sessionId) {
      const ordered = await sortedRange(this.redis, redisKeys.joinOrder(roomCode), 0, -1)
      const participantKeys = await hashKeys(this.redis, redisKeys.participants(roomCode))
      const remainingSet = new Set(participantKeys.filter((id) => id !== sessionId))

      const nextOwner = ordered.find((id) => remainingSet.has(id))
      if (!nextOwner) {
        throw new RoomManagerError(ERROR_CODES.notInRoom, 'No active participant left to promote as owner.')
      }

      ownerChangedPayload = {
        roomCode,
        ownerSessionId: nextOwner,
        previousOwnerSessionId: sessionId,
        reason: 'owner_left'
      }
    }

    const multi = this.redis.multi()
    multi.hDel(redisKeys.participants(roomCode), sessionId)
    multi.zRem(redisKeys.joinOrder(roomCode), sessionId)
    multi.del(redisKeys.displayName(roomCode, participant.displayName))
    multi.del(redisKeys.session(sessionId))
    multi.hSet(redisKeys.room(roomCode), 'participantCount', String(participantCount))

    if (ownerChangedPayload) {
      multi.hSet(redisKeys.room(roomCode), 'ownerSessionId', ownerChangedPayload.ownerSessionId)
      // Fetch new owner's avatarId for ownerAvatarId update
      const newOwnerParticipantJson = await hashGet(this.redis, redisKeys.participants(roomCode), ownerChangedPayload.ownerSessionId)
      if (newOwnerParticipantJson) {
        const newOwnerParticipant = JSON.parse(newOwnerParticipantJson) as Participant
        multi.hSet(redisKeys.room(roomCode), 'ownerAvatarId', newOwnerParticipant.avatarId || '')
      }
    }

    await multi.exec()

    return { leftPayload, ownerChangedPayload, roomCode, deletedRoom: false }
  }

  async updateDisplayName(sessionId: string, displayName: string): Promise<DisplayNameUpdatedPayload> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode

    const existingHolder = await stringGet(this.redis, redisKeys.displayName(roomCode, displayName))
    if (existingHolder && existingHolder !== sessionId) {
      throw new RoomManagerError(ERROR_CODES.displayNameInUse, 'Display name is already in use in this room.')
    }

    const participantJson = await hashGet(this.redis, redisKeys.participants(roomCode), sessionId)
    if (!participantJson) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Participant not found in room.')
    }

    const participant = JSON.parse(participantJson) as Participant
    const previousDisplayName = participant.displayName
    participant.displayName = displayName

    const multi = this.redis.multi()
    multi.del(redisKeys.displayName(roomCode, previousDisplayName))
    multi.set(redisKeys.displayName(roomCode, displayName), sessionId)
    multi.hSet(redisKeys.participants(roomCode), sessionId, JSON.stringify(participant))
    multi.hSet(redisKeys.session(sessionId), 'displayName', displayName)
    await multi.exec()

    return { roomCode, sessionId, previousDisplayName, displayName }
  }

  async takeOwner(sessionId: string): Promise<OwnerChangedPayload> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode

    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (!roomMeta.roomCode) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    if (roomMeta.instantOwnerTakeoverEnabled !== '1') {
      throw new RoomManagerError(ERROR_CODES.ownerTakeoverDisabled, 'Owner takeover is disabled for this room.')
    }

    const previousOwnerSessionId = roomMeta.ownerSessionId
    const sessionAvatarId = (await hashGet(this.redis, redisKeys.session(sessionId), 'avatarId')) || ''
    await this.redis.hSet(redisKeys.room(roomCode), {
      ownerSessionId: sessionId,
      ownerAvatarId: sessionAvatarId
    })

    return { roomCode, ownerSessionId: sessionId, previousOwnerSessionId, reason: 'manual' }
  }

  async updateRoomSettings(sessionId: string, partialSettings: Partial<RoomSettings>): Promise<RoomSettingsUpdatedPayload> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode

    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (!roomMeta.roomCode) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    if (roomMeta.ownerSessionId !== sessionId) {
      throw new RoomManagerError(ERROR_CODES.notOwner, 'Only the current owner can update room settings.')
    }

    const currentSettings: RoomSettings = {
      autoOwnerEnabled: roomMeta.autoOwnerEnabled === '1',
      instantOwnerTakeoverEnabled: roomMeta.instantOwnerTakeoverEnabled === '1',
      filterMode: roomMeta.filterMode as RoomSettings['filterMode'],
      filterPaths: JSON.parse(roomMeta.filterPaths || '[]')
    }

    const nextSettings = mergeSettings({ ...currentSettings, ...partialSettings })

    await this.redis.hSet(redisKeys.room(roomCode), {
      autoOwnerEnabled: nextSettings.autoOwnerEnabled ? '1' : '0',
      instantOwnerTakeoverEnabled: nextSettings.instantOwnerTakeoverEnabled ? '1' : '0',
      filterMode: nextSettings.filterMode,
      filterPaths: JSON.stringify(nextSettings.filterPaths)
    })

    return { roomCode, updatedBySessionId: sessionId, settings: nextSettings }
  }

  async handleParamBatch(sessionId: string, payload: ParamBatchPayload): Promise<HandleParamBatchResult | null> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode
    const normalizedParams = normalizeParams(payload.params)

    if (normalizedParams.length === 0) {
      return null
    }

    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (!roomMeta.roomCode) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    let ownerChangedPayload: OwnerChangedPayload | undefined
    const paramPaths = normalizedParams.map(p => p.path)

    if (roomMeta.ownerSessionId !== sessionId) {
      if (roomMeta.autoOwnerEnabled !== '1') {
        throw new RoomManagerError(ERROR_CODES.notOwner, 'Only the current owner can broadcast parameter updates.')
      }

      // Only transfer ownership if the batch contains at least one
      // "stable" parameter (not rapidly changing like tracking data).
      if (!this.paramRateTracker.hasStableParam(roomCode, paramPaths)) {
        return null
      }

      const sessionAvatarId = (await hashGet(this.redis, redisKeys.session(sessionId), 'avatarId')) || ''
      await this.redis.hSet(redisKeys.room(roomCode), {
        ownerSessionId: sessionId,
        ownerAvatarId: sessionAvatarId
      })
      ownerChangedPayload = {
        roomCode,
        ownerSessionId: sessionId,
        previousOwnerSessionId: roomMeta.ownerSessionId,
        reason: 'auto_owner'
      }
    }

    // Record param updates for rate tracking (used by auto-owner heuristic)
    this.paramRateTracker.recordUpdates(roomCode, paramPaths)

    const stateUpdates: Record<string, string> = {}
    for (const param of normalizedParams) {
      stateUpdates[param.path] = JSON.stringify(param)
    }
    await this.redis.hSet(redisKeys.state(roomCode), stateUpdates)

    return {
      outboundPayload: {
        roomCode,
        sourceSessionId: sessionId,
        batchSeq: payload.batchSeq,
        params: normalizedParams
      },
      ownerChangedPayload
    }
  }

  async getRoomCodeBySession(sessionId: string): Promise<string | null> {
    return (await hashGet(this.redis, redisKeys.session(sessionId), 'roomCode')) ?? null
  }

  async updateAvatarId(sessionId: string, avatarId: string): Promise<AvatarIdUpdatedPayload> {
    const session = await this.requireSession(sessionId)
    const roomCode = session.roomCode

    // Update session avatarId
    await this.redis.hSet(redisKeys.session(sessionId), 'avatarId', avatarId)

    // Update participant record
    const participantJson = await hashGet(this.redis, redisKeys.participants(roomCode), sessionId)
    if (participantJson) {
      const participant = JSON.parse(participantJson) as Participant
      participant.avatarId = avatarId
      await this.redis.hSet(redisKeys.participants(roomCode), sessionId, JSON.stringify(participant))
    }

    // If this session is owner, update room's ownerAvatarId
    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (roomMeta.ownerSessionId === sessionId) {
      await this.redis.hSet(redisKeys.room(roomCode), 'ownerAvatarId', avatarId)
    }

    return { roomCode, sessionId, avatarId }
  }

  async getParticipantSessionIds(roomCode: string): Promise<string[]> {
    return await hashKeys(this.redis, redisKeys.participants(roomCode))
  }

  async toRoomState(roomCode: string, selfSessionId: string): Promise<RoomJoinedPayload> {
    return await this.buildRoomJoinedPayload(roomCode, selfSessionId)
  }

  private async requireSession(sessionId: string): Promise<{ sessionId: string; roomCode: string; displayName: string }> {
    const sessionData = await hashGetAll(this.redis, redisKeys.session(sessionId))
    if (!sessionData.sessionId || !sessionData.roomCode) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Session is not currently in a room.')
    }

    return {
      sessionId: sessionData.sessionId,
      roomCode: sessionData.roomCode,
      displayName: sessionData.displayName
    }
  }

  private async ensureSessionNotInRoom(sessionId: string): Promise<void> {
    const roomCode = await hashGet(this.redis, redisKeys.session(sessionId), 'roomCode')
    if (roomCode) {
      throw new RoomManagerError(ERROR_CODES.invalidMessage, 'Leave the current room before starting a new room action.')
    }
  }

  private async generateRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = generateRoomCodeCandidate()
      const exists = await this.redis.exists(redisKeys.room(candidate))
      if (!exists) {
        return candidate
      }
    }

    throw new RoomManagerError(ERROR_CODES.invalidMessage, 'Unable to generate a unique room code.')
  }

  private async buildRoomJoinedPayload(roomCode: string, selfSessionId: string): Promise<RoomJoinedPayload> {
    const roomMeta = await hashGetAll(this.redis, redisKeys.room(roomCode))
    if (!roomMeta.roomCode) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    const ordered = await sortedRange(this.redis, redisKeys.joinOrder(roomCode), 0, -1)
    const participantsHash = await hashGetAll(this.redis, redisKeys.participants(roomCode))

    const participants: Participant[] = ordered
      .filter((sessionId) => sessionId in participantsHash)
      .map((sessionId) => JSON.parse(participantsHash[sessionId]) as Participant)

    const stateHash = await hashGetAll(this.redis, redisKeys.state(roomCode))
    const snapshot: ParamValue[] = Object.values(stateHash).map((v) => JSON.parse(v) as ParamValue)

    const settings: RoomSettings = {
      autoOwnerEnabled: roomMeta.autoOwnerEnabled === '1',
      instantOwnerTakeoverEnabled: roomMeta.instantOwnerTakeoverEnabled === '1',
      filterMode: roomMeta.filterMode as RoomSettings['filterMode'],
      filterPaths: JSON.parse(roomMeta.filterPaths || '[]')
    }

    return {
      roomCode,
      selfSessionId,
      ownerSessionId: roomMeta.ownerSessionId,
      settings,
      participants,
      snapshot,
      ownerAvatarId: roomMeta.ownerAvatarId || null
    }
  }
}