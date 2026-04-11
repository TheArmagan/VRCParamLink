import {
  createDefaultRoomSettings,
  ERROR_CODES,
  FILTER_MODES,
  isSupportedOscPath,
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  type ParamValue,
  type Participant,
  type RoomJoinedPayload,
  type RoomSettings
} from '../../../shared/src/index.ts'
import { RoomManagerError } from './room-errors.ts'
import type { RoomRecord } from './room-types.ts'

export function mergeSettings(partialSettings?: Partial<RoomSettings>): RoomSettings {
  const defaults = createDefaultRoomSettings()
  const filterPaths = [...new Set((partialSettings?.filterPaths ?? defaults.filterPaths).map((entry) => entry.trim()))]

  for (const path of filterPaths) {
    if (!isSupportedOscPath(path)) {
      throw new RoomManagerError(ERROR_CODES.invalidFilterPath, `Unsupported filter path: ${path}`)
    }
  }

  const filterMode = partialSettings?.filterMode ?? defaults.filterMode
  if (![FILTER_MODES.allowAll, FILTER_MODES.whitelist, FILTER_MODES.blacklist].includes(filterMode)) {
    throw new RoomManagerError(ERROR_CODES.invalidFilterMode, 'Invalid filter mode.')
  }

  return {
    autoOwnerEnabled: partialSettings?.autoOwnerEnabled ?? defaults.autoOwnerEnabled,
    instantOwnerTakeoverEnabled:
      partialSettings?.instantOwnerTakeoverEnabled ?? defaults.instantOwnerTakeoverEnabled,
    filterMode,
    filterPaths
  }
}

export function normalizeParams(params: ParamValue[]): ParamValue[] {
  const latestByPath = new Map<string, ParamValue>()

  for (const param of params) {
    if (!isSupportedOscPath(param.path)) {
      throw new RoomManagerError(ERROR_CODES.invalidParamPath, `Unsupported OSC path: ${param.path}`)
    }

    if (!isSupportedValueType(param)) {
      throw new RoomManagerError(ERROR_CODES.unsupportedParamType, `Unsupported param type: ${param.valueType}`)
    }

    latestByPath.set(param.path, { ...param })
  }

  return [...latestByPath.values()]
}

export function mergeSnapshot(currentSnapshot: ParamValue[], incomingParams: ParamValue[]): ParamValue[] {
  const snapshotMap = new Map(currentSnapshot.map((param) => [param.path, { ...param }]))

  for (const param of incomingParams) {
    snapshotMap.set(param.path, { ...param })
  }

  return [...snapshotMap.values()]
}

export function ensureUniqueDisplayName(room: RoomRecord, displayName: string, ignoredSessionId?: string): void {
  for (const participant of room.participants.values()) {
    if (participant.sessionId === ignoredSessionId) {
      continue
    }

    if (participant.displayName.toLowerCase() === displayName.toLowerCase()) {
      throw new RoomManagerError(ERROR_CODES.displayNameInUse, 'Display name is already in use in this room.')
    }
  }
}

export function createParticipant(sessionId: string, displayName: string): Participant {
  return {
    sessionId,
    displayName,
    joinedAt: Date.now(),
    connected: true
  }
}

export function getOldestActiveSessionId(room: RoomRecord): string {
  const nextSessionId = room.joinOrder.find((entry) => room.participants.has(entry))
  if (!nextSessionId) {
    throw new RoomManagerError(ERROR_CODES.notInRoom, 'No active participant left to promote as owner.')
  }

  return nextSessionId
}

export function generateRoomCode(rooms: Map<string, RoomRecord>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const roomCode = Array.from({ length: ROOM_CODE_LENGTH }, () => {
      const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARSET.length)
      return ROOM_CODE_CHARSET[randomIndex]
    }).join('')

    if (!rooms.has(roomCode)) {
      return roomCode
    }
  }

  throw new RoomManagerError(ERROR_CODES.invalidMessage, 'Unable to generate a unique room code.')
}

export function toRoomJoinedPayload(room: RoomRecord, selfSessionId: string): RoomJoinedPayload {
  return {
    roomCode: room.roomCode,
    selfSessionId,
    ownerSessionId: room.ownerSessionId,
    settings: {
      ...room.settings,
      filterPaths: [...room.settings.filterPaths]
    },
    participants: room.joinOrder
      .map((sessionId) => room.participants.get(sessionId))
      .filter((participant): participant is Participant => Boolean(participant))
      .map((participant) => ({ ...participant })),
    snapshot: [...room.snapshot]
  }
}

function isSupportedValueType(param: ParamValue): boolean {
  if (param.valueType === 'bool') {
    return typeof param.value === 'boolean'
  }

  if (param.valueType === 'int') {
    return typeof param.value === 'number' && Number.isInteger(param.value)
  }

  if (param.valueType === 'float') {
    return typeof param.value === 'number'
  }

  return false
}