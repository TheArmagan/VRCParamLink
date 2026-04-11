import {
  CLIENT_EVENT_TYPES,
  FILTER_MODES,
  type AvatarChangePayload,
  type HeartbeatPayload,
  type HelloPayload,
  type JoinRoomPayload,
  type CreateRoomPayload,
  type ParamBatchPayload,
  type SetDisplayNamePayload,
  type SetRoomSettingsPayload,
  type SocketEnvelope
} from '../../../shared/src/index.ts'

type JsonRecord = Record<string, unknown>

export function createEnvelope<TPayload>(
  type: string,
  payload: TPayload,
  requestId?: string
): SocketEnvelope<TPayload> {
  return {
    type,
    requestId,
    ts: Date.now(),
    payload
  }
}

export function parseSocketEnvelope(message: string | BufferSource): SocketEnvelope<JsonRecord> | null {
  const decodedMessage = decodeMessage(message)
  if (!decodedMessage) {
    return null
  }

  try {
    const parsed = JSON.parse(decodedMessage) as unknown
    if (!isPlainObject(parsed)) {
      return null
    }

    if (typeof parsed.type !== 'string' || typeof parsed.ts !== 'number' || !('payload' in parsed)) {
      return null
    }

    return parsed as unknown as SocketEnvelope<JsonRecord>
  } catch {
    return null
  }
}

export function isHelloPayload(payload: unknown): payload is HelloPayload {
  return (
    isPlainObject(payload) &&
    typeof payload.displayName === 'string' &&
    payload.displayName.trim().length > 0 &&
    typeof payload.clientVersion === 'string' &&
    payload.clientVersion.trim().length > 0 &&
    (payload.resumeSessionId === undefined || typeof payload.resumeSessionId === 'string') &&
    (payload.resumeRoomCode === undefined || typeof payload.resumeRoomCode === 'string')
  )
}

export function isHeartbeatPayload(payload: unknown): payload is HeartbeatPayload {
  return (
    payload === undefined ||
    (isPlainObject(payload) && (payload.roomCode === undefined || typeof payload.roomCode === 'string'))
  )
}

export function requiresHandshake(eventType: string): boolean {
  return eventType !== CLIENT_EVENT_TYPES.hello
}

function decodeMessage(message: string | BufferSource): string | null {
  if (typeof message === 'string') {
    return message
  }

  if (message instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(message))
  }

  if (ArrayBuffer.isView(message)) {
    return new TextDecoder().decode(message)
  }

  return null
}

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCreateRoomPayload(payload: unknown): payload is CreateRoomPayload {
  if (payload === undefined) {
    return true
  }

  if (!isPlainObject(payload)) {
    return false
  }

  if (payload.settings === undefined) {
    return true
  }

  return isSetRoomSettingsPayload(payload.settings)
}

export function isJoinRoomPayload(payload: unknown): payload is JoinRoomPayload {
  return isPlainObject(payload) && typeof payload.roomCode === 'string'
}

export function isSetDisplayNamePayload(payload: unknown): payload is SetDisplayNamePayload {
  return isPlainObject(payload) && typeof payload.displayName === 'string' && payload.displayName.trim().length > 0
}

export function isSetRoomSettingsPayload(payload: unknown): payload is SetRoomSettingsPayload {
  if (!isPlainObject(payload)) {
    return false
  }

  const hasValidFilterMode =
    payload.filterMode === undefined ||
    payload.filterMode === FILTER_MODES.allowAll ||
    payload.filterMode === FILTER_MODES.whitelist ||
    payload.filterMode === FILTER_MODES.blacklist

  const hasValidFilterPaths =
    payload.filterPaths === undefined ||
    (Array.isArray(payload.filterPaths) && payload.filterPaths.every((entry) => typeof entry === 'string'))

  return (
    (payload.autoOwnerEnabled === undefined || typeof payload.autoOwnerEnabled === 'boolean') &&
    (payload.instantOwnerTakeoverEnabled === undefined || typeof payload.instantOwnerTakeoverEnabled === 'boolean') &&
    hasValidFilterMode &&
    hasValidFilterPaths
  )
}

export function isEmptyPayload(payload: unknown): payload is Record<string, never> {
  return payload === undefined || (isPlainObject(payload) && Object.keys(payload).length === 0)
}

export function isParamBatchPayload(payload: unknown): payload is ParamBatchPayload {
  if (!isPlainObject(payload) || typeof payload.batchSeq !== 'number' || !Array.isArray(payload.params)) {
    return false
  }

  return payload.params.every((entry) => {
    if (!isPlainObject(entry)) {
      return false
    }

    const hasValidValueType = entry.valueType === 'bool' || entry.valueType === 'int' || entry.valueType === 'float'
    const hasValidValue =
      (entry.valueType === 'bool' && typeof entry.value === 'boolean') ||
      ((entry.valueType === 'int' || entry.valueType === 'float') && typeof entry.value === 'number')

    return typeof entry.path === 'string' && hasValidValueType && hasValidValue
  })
}

export function isAvatarChangePayload(payload: unknown): payload is AvatarChangePayload {
  return isPlainObject(payload) && typeof payload.avatarId === 'string' && payload.avatarId.length > 0
}