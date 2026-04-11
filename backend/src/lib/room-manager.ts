import {
  ERROR_CODES,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_MAX_PARTICIPANTS,
  type DisplayNameUpdatedPayload,
  type OwnerChangedPayload,
  type ParamBatchPayload,
  type ParticipantLeaveReason,
  type ParticipantLeftPayload,
  type RoomJoinedPayload,
  type RoomSettings,
  type RoomSettingsUpdatedPayload
} from '../../../shared/src/index.ts'
import {
  createParticipant,
  ensureUniqueDisplayName,
  generateRoomCode,
  getOldestActiveSessionId,
  mergeSettings,
  mergeSnapshot,
  normalizeParams,
  toRoomJoinedPayload
} from './room-helpers.ts'
import { RoomManagerError } from './room-errors.ts'
import type { HandleParamBatchResult, LeaveRoomResult, RoomRecord } from './room-types.ts'

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly sessionToRoom = new Map<string, string>()

  createRoom(sessionId: string, displayName: string, requestedSettings?: Partial<RoomSettings>): RoomJoinedPayload {
    this.ensureSessionNotInRoom(sessionId)

    const roomCode = generateRoomCode(this.rooms)
    const settings = mergeSettings(requestedSettings)
    const participant = createParticipant(sessionId, displayName)
    const room: RoomRecord = {
      roomCode,
      ownerSessionId: sessionId,
      settings,
      participants: new Map([[sessionId, participant]]),
      joinOrder: [sessionId],
      snapshot: []
    }

    this.rooms.set(roomCode, room)
    this.sessionToRoom.set(sessionId, roomCode)

    return toRoomJoinedPayload(room, sessionId)
  }

  joinRoom(sessionId: string, displayName: string, rawRoomCode: string): RoomJoinedPayload {
    this.ensureSessionNotInRoom(sessionId)

    const roomCode = normalizeRoomCode(rawRoomCode)
    if (!isValidRoomCode(roomCode)) {
      throw new RoomManagerError(ERROR_CODES.invalidRoomCode, 'Room code format is invalid.')
    }

    const room = this.rooms.get(roomCode)
    if (!room) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    if (room.participants.size >= ROOM_MAX_PARTICIPANTS) {
      throw new RoomManagerError(ERROR_CODES.roomFull, 'Room is full.')
    }

    ensureUniqueDisplayName(room, displayName)

    const participant = createParticipant(sessionId, displayName)
    room.participants.set(sessionId, participant)
    room.joinOrder.push(sessionId)
    this.sessionToRoom.set(sessionId, roomCode)

    return toRoomJoinedPayload(room, sessionId)
  }

  leaveRoom(sessionId: string, reason: ParticipantLeaveReason): LeaveRoomResult {
    const room = this.requireRoomBySession(sessionId)
    const participant = room.participants.get(sessionId)
    if (!participant) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Participant not found in room.')
    }

    room.participants.delete(sessionId)
    room.joinOrder = room.joinOrder.filter((entry) => entry !== sessionId)
    this.sessionToRoom.delete(sessionId)

    const leftPayload: ParticipantLeftPayload = {
      roomCode: room.roomCode,
      sessionId,
      displayName: participant.displayName,
      reason
    }

    if (room.participants.size === 0) {
      this.rooms.delete(room.roomCode)
      return {
        leftPayload,
        roomCode: room.roomCode,
        deletedRoom: true
      }
    }

    let ownerChangedPayload: OwnerChangedPayload | undefined

    if (room.ownerSessionId === sessionId) {
      const nextOwner = getOldestActiveSessionId(room)
      const previousOwnerSessionId = room.ownerSessionId
      room.ownerSessionId = nextOwner
      ownerChangedPayload = {
        roomCode: room.roomCode,
        ownerSessionId: nextOwner,
        previousOwnerSessionId,
        reason: 'owner_left'
      }
    }

    return {
      leftPayload,
      ownerChangedPayload,
      roomCode: room.roomCode,
      deletedRoom: false
    }
  }

  updateDisplayName(sessionId: string, displayName: string): DisplayNameUpdatedPayload {
    const room = this.requireRoomBySession(sessionId)
    const participant = room.participants.get(sessionId)
    if (!participant) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Participant not found in room.')
    }

    ensureUniqueDisplayName(room, displayName, sessionId)

    const previousDisplayName = participant.displayName
    participant.displayName = displayName

    return {
      roomCode: room.roomCode,
      sessionId,
      previousDisplayName,
      displayName
    }
  }

  takeOwner(sessionId: string): OwnerChangedPayload {
    const room = this.requireRoomBySession(sessionId)

    if (!room.settings.instantOwnerTakeoverEnabled) {
      throw new RoomManagerError(ERROR_CODES.ownerTakeoverDisabled, 'Owner takeover is disabled for this room.')
    }

    const previousOwnerSessionId = room.ownerSessionId
    room.ownerSessionId = sessionId

    return {
      roomCode: room.roomCode,
      ownerSessionId: sessionId,
      previousOwnerSessionId,
      reason: 'manual'
    }
  }

  updateRoomSettings(sessionId: string, partialSettings: Partial<RoomSettings>): RoomSettingsUpdatedPayload {
    const room = this.requireRoomBySession(sessionId)

    if (room.ownerSessionId !== sessionId) {
      throw new RoomManagerError(ERROR_CODES.notOwner, 'Only the current owner can update room settings.')
    }

    const nextSettings = mergeSettings({
      ...room.settings,
      ...partialSettings
    })

    room.settings = nextSettings

    return {
      roomCode: room.roomCode,
      updatedBySessionId: sessionId,
      settings: nextSettings
    }
  }

  handleParamBatch(sessionId: string, payload: ParamBatchPayload): HandleParamBatchResult | null {
    const room = this.requireRoomBySession(sessionId)
    const normalizedParams = normalizeParams(payload.params)

    if (normalizedParams.length === 0) {
      return null
    }

    let ownerChangedPayload: OwnerChangedPayload | undefined

    if (room.ownerSessionId !== sessionId) {
      if (!room.settings.autoOwnerEnabled) {
        throw new RoomManagerError(ERROR_CODES.notOwner, 'Only the current owner can broadcast parameter updates.')
      }

      const previousOwnerSessionId = room.ownerSessionId
      room.ownerSessionId = sessionId
      ownerChangedPayload = {
        roomCode: room.roomCode,
        ownerSessionId: sessionId,
        previousOwnerSessionId,
        reason: 'auto_owner'
      }
    }

    room.snapshot = mergeSnapshot(room.snapshot, normalizedParams)

    return {
      outboundPayload: {
        roomCode: room.roomCode,
        sourceSessionId: sessionId,
        batchSeq: payload.batchSeq,
        params: normalizedParams
      },
      ownerChangedPayload
    }
  }

  getRoomCodeBySession(sessionId: string): string | null {
    return this.sessionToRoom.get(sessionId) ?? null
  }

  getParticipantSessionIds(roomCode: string): string[] {
    const room = this.rooms.get(roomCode)
    return room ? [...room.participants.keys()] : []
  }

  toRoomState(roomCode: string, selfSessionId: string): RoomJoinedPayload {
    const room = this.rooms.get(roomCode)
    if (!room) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found.')
    }

    return toRoomJoinedPayload(room, selfSessionId)
  }

  private requireRoomBySession(sessionId: string): RoomRecord {
    const roomCode = this.sessionToRoom.get(sessionId)
    if (!roomCode) {
      throw new RoomManagerError(ERROR_CODES.notInRoom, 'Session is not currently in a room.')
    }

    const room = this.rooms.get(roomCode)
    if (!room) {
      throw new RoomManagerError(ERROR_CODES.roomNotFound, 'Room not found for session.')
    }

    return room
  }

  private ensureSessionNotInRoom(sessionId: string): void {
    if (this.sessionToRoom.has(sessionId)) {
      throw new RoomManagerError(ERROR_CODES.invalidMessage, 'Leave the current room before starting a new room action.')
    }
  }
}