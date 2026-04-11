import {
  APP_NAME,
  APP_SCREENS,
  CONNECTION_STATES,
  createDefaultRoomSettings,
  ERROR_CODES,
  SESSION_STATUSES,
  type DisplayNameUpdatedPayload,
  type ErrorState,
  type OwnerChangedPayload,
  type OutboundParamBatchPayload,
  type ParticipantJoinedPayload,
  type ParticipantLeftPayload,
  type RendererAppState,
  type RoomJoinedPayload,
  type RoomSettingsUpdatedPayload,
  type UpdateDisplayNameResult
} from '../../../../shared/src/index.ts'

const defaultRoomSettings = createDefaultRoomSettings()

const state: RendererAppState = {
  appName: APP_NAME,
  screen: APP_SCREENS.welcome,
  selfSessionId: null,
  displayName: '',
  roomCode: '',
  participantList: [],
  ownerSessionId: null,
  autoOwnerEnabled: defaultRoomSettings.autoOwnerEnabled,
  instantOwnerTakeoverEnabled: defaultRoomSettings.instantOwnerTakeoverEnabled,
  filterMode: defaultRoomSettings.filterMode,
  filterPaths: [...defaultRoomSettings.filterPaths],
  connectionState: CONNECTION_STATES.idle,
  sessionStatus: SESSION_STATUSES.idle,
  lastSyncAt: null,
  lastSyncDirection: null,
  lastBatchSize: 0,
  lastBatchSourceSessionId: null,
  sentBatchCount: 0,
  receivedBatchCount: 0,
  errorState: null
}

export function getAppState(): RendererAppState {
  return structuredClone(state)
}

export function updateDisplayName(displayName: string): UpdateDisplayNameResult {
  const normalizedDisplayName = displayName.trim()

  if (!normalizedDisplayName) {
    const error = {
      code: ERROR_CODES.displayNameRequired,
      message: 'Display name is required before continuing.'
    }

    state.errorState = error
    return { ok: false, error }
  }

  state.displayName = normalizedDisplayName
  state.sessionStatus = state.roomCode ? SESSION_STATUSES.inRoom : SESSION_STATUSES.named
  state.errorState = null

  if (state.selfSessionId) {
    state.participantList = state.participantList.map((participant) =>
      participant.sessionId === state.selfSessionId
        ? { ...participant, displayName: normalizedDisplayName }
        : participant
    )
  }

  return {
    ok: true,
    state: getAppState()
  }
}

export function setConnectionState(connectionState: RendererAppState['connectionState']): void {
  state.connectionState = connectionState
}

export function setErrorState(errorState: ErrorState | null): void {
  state.errorState = errorState
}

export function setSelfSessionId(sessionId: string | null): void {
  state.selfSessionId = sessionId
}

export function applyRoomJoined(payload: RoomJoinedPayload): void {
  state.screen = APP_SCREENS.room
  state.selfSessionId = payload.selfSessionId
  state.roomCode = payload.roomCode
  state.ownerSessionId = payload.ownerSessionId
  state.participantList = [...payload.participants]
  state.autoOwnerEnabled = payload.settings.autoOwnerEnabled
  state.instantOwnerTakeoverEnabled = payload.settings.instantOwnerTakeoverEnabled
  state.filterMode = payload.settings.filterMode
  state.filterPaths = [...payload.settings.filterPaths]
  state.sessionStatus = SESSION_STATUSES.inRoom
  state.lastSyncAt = payload.snapshot.length > 0 ? Date.now() : null
  state.lastSyncDirection = payload.snapshot.length > 0 ? 'incoming' : null
  state.lastBatchSize = payload.snapshot.length
  state.lastBatchSourceSessionId = payload.snapshot.length > 0 ? payload.ownerSessionId : null
  state.sentBatchCount = 0
  state.receivedBatchCount = payload.snapshot.length > 0 ? 1 : 0
  state.errorState = null
}

export function applyParticipantJoined(payload: ParticipantJoinedPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  const existingIndex = state.participantList.findIndex((participant) => participant.sessionId === payload.participant.sessionId)
  if (existingIndex >= 0) {
    state.participantList[existingIndex] = payload.participant
    return
  }

  state.participantList = [...state.participantList, payload.participant]
}

export function applyParticipantLeft(payload: ParticipantLeftPayload): void {
  if (payload.sessionId === state.selfSessionId) {
    clearRoomState()
    return
  }

  if (payload.roomCode !== state.roomCode) {
    return
  }

  state.participantList = state.participantList.filter((participant) => participant.sessionId !== payload.sessionId)
}

export function applyDisplayNameUpdated(payload: DisplayNameUpdatedPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  state.participantList = state.participantList.map((participant) =>
    participant.sessionId === payload.sessionId
      ? { ...participant, displayName: payload.displayName }
      : participant
  )

  if (payload.sessionId === state.selfSessionId) {
    state.displayName = payload.displayName
  }
}

export function applyOwnerChanged(payload: OwnerChangedPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  state.ownerSessionId = payload.ownerSessionId
}

export function applyRoomSettingsUpdated(payload: RoomSettingsUpdatedPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  state.autoOwnerEnabled = payload.settings.autoOwnerEnabled
  state.instantOwnerTakeoverEnabled = payload.settings.instantOwnerTakeoverEnabled
  state.filterMode = payload.settings.filterMode
  state.filterPaths = [...payload.settings.filterPaths]
}

export function applyParamBatch(_payload: OutboundParamBatchPayload): void {
  if (_payload.roomCode !== state.roomCode) {
    return
  }

  state.lastSyncAt = Date.now()
  state.lastSyncDirection = 'incoming'
  state.lastBatchSize = _payload.params.length
  state.lastBatchSourceSessionId = _payload.sourceSessionId
  state.receivedBatchCount += 1
}

export function applyLocalParamBatch(paramCount: number): void {
  if (!state.roomCode || paramCount <= 0) {
    return
  }

  state.lastSyncAt = Date.now()
  state.lastSyncDirection = 'outgoing'
  state.lastBatchSize = paramCount
  state.lastBatchSourceSessionId = state.selfSessionId
  state.sentBatchCount += 1
}

export function clearRoomState(): void {
  state.screen = APP_SCREENS.welcome
  state.roomCode = ''
  state.participantList = []
  state.ownerSessionId = null
  state.autoOwnerEnabled = defaultRoomSettings.autoOwnerEnabled
  state.instantOwnerTakeoverEnabled = defaultRoomSettings.instantOwnerTakeoverEnabled
  state.filterMode = defaultRoomSettings.filterMode
  state.filterPaths = [...defaultRoomSettings.filterPaths]
  state.sessionStatus = state.displayName ? SESSION_STATUSES.named : SESSION_STATUSES.idle
  state.lastSyncAt = null
  state.lastSyncDirection = null
  state.lastBatchSize = 0
  state.lastBatchSourceSessionId = null
  state.sentBatchCount = 0
  state.receivedBatchCount = 0
  state.errorState = null
}