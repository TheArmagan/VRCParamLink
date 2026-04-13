import picomatch from 'picomatch'
import {
  APP_NAME,
  APP_SCREENS,
  CONNECTION_STATES,
  createDefaultRoomSettings,
  ERROR_CODES,
  FILTER_MODES,
  isInputOscPath,
  PARAM_LIST_MAX_SIZE,
  SESSION_STATUSES,
  type AvatarIdUpdatedPayload,
  type DisplayNameUpdatedPayload,
  type ErrorState,
  type OutboundRemoteParamEditPayload,
  type OwnerChangedPayload,
  type OutboundParamBatchPayload,
  type ParamEntry,
  type ParamValue,
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
  appVersion: '',

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
  filterBlacklistPaths: [...defaultRoomSettings.filterBlacklistPaths],
  connectionState: CONNECTION_STATES.idle,
  sessionStatus: SESSION_STATUSES.idle,
  lastSyncAt: null,
  lastSyncDirection: null,
  lastBatchSize: 0,
  lastBatchSourceSessionId: null,
  sentBatchCount: 0,
  receivedBatchCount: 0,
  errorState: null,
  parameterList: [],
  lastSyncParamName: null,
  selfAvatarId: null,
  ownerAvatarId: null,
  avatarSyncActive: false,
  localPlaybackEnabled: true,
  participantParams: {},
  inputSendEnabled: false,
  inputReceiveEnabled: false,
  trackingSendEnabled: false,
  trackingReceiveEnabled: false,
  trackingSendSlots: [],
  trackingReceiveSlots: []
}

const syncToggles = new Map<string, boolean>()

export function getAppState(): RendererAppState {
  return structuredClone(state)
}

export function setAppVersion(version: string): void {
  state.appVersion = version
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
  state.filterBlacklistPaths = [...payload.settings.filterBlacklistPaths]
  state.sessionStatus = SESSION_STATUSES.inRoom
  state.lastSyncAt = payload.snapshot.length > 0 ? Date.now() : null
  state.lastSyncDirection = payload.snapshot.length > 0 ? 'incoming' : null
  state.lastBatchSize = payload.snapshot.length
  state.lastBatchSourceSessionId = payload.snapshot.length > 0 ? payload.ownerSessionId : null
  state.sentBatchCount = 0
  state.receivedBatchCount = payload.snapshot.length > 0 ? 1 : 0
  state.errorState = null
  state.ownerAvatarId = payload.ownerAvatarId ?? null
  state.avatarSyncActive = computeAvatarSyncActive()

  // Build initial parameterList from snapshot
  if (payload.snapshot.length > 0) {
    updateParameterList(payload.snapshot)
    state.lastSyncParamName = extractShortParamName(payload.snapshot[0].path)
    // Attribute snapshot params to owner
    updateParticipantParams(payload.ownerSessionId, payload.snapshot)
  } else {
    state.parameterList = []
    state.lastSyncParamName = null
  }
  state.participantParams = {}
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
  delete state.participantParams[payload.sessionId]
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

  // Update ownerAvatarId from participant list
  const newOwner = state.participantList.find((p) => p.sessionId === payload.ownerSessionId)
  state.ownerAvatarId = newOwner?.avatarId ?? null
  state.avatarSyncActive = computeAvatarSyncActive()
}

export function applyRoomSettingsUpdated(payload: RoomSettingsUpdatedPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  state.autoOwnerEnabled = payload.settings.autoOwnerEnabled
  state.instantOwnerTakeoverEnabled = payload.settings.instantOwnerTakeoverEnabled
  state.filterMode = payload.settings.filterMode
  state.filterPaths = [...payload.settings.filterPaths]
  state.filterBlacklistPaths = [...payload.settings.filterBlacklistPaths]

  // Purge params that no longer pass the updated filter
  state.parameterList = state.parameterList.filter((e) => passesFilter(e.path))
  for (const sessionId of Object.keys(state.participantParams)) {
    state.participantParams[sessionId] = state.participantParams[sessionId].filter((e) => passesFilter(e.path))
  }
}

export function applyParamBatch(_payload: OutboundParamBatchPayload): void {
  if (_payload.roomCode !== state.roomCode) {
    return
  }

  // Filter out /input params — they are transient control inputs, not tracked in state
  const avatarParams = _payload.params.filter((p) => !isInputOscPath(p.path))

  state.lastSyncAt = Date.now()
  state.lastSyncDirection = 'incoming'
  state.lastBatchSize = _payload.params.length
  state.lastBatchSourceSessionId = _payload.sourceSessionId
  state.receivedBatchCount += 1

  if (avatarParams.length > 0) {
    updateParameterList(avatarParams)
    updateParticipantParams(_payload.sourceSessionId, avatarParams)
    state.lastSyncParamName = extractShortParamName(avatarParams[0].path)
  } else if (_payload.params.length > 0) {
    state.lastSyncParamName = extractShortParamName(_payload.params[0].path)
  }
}

export function applyLocalParamBatch(paramCount: number, params?: ParamValue[]): void {
  if (!state.roomCode || paramCount <= 0) {
    return
  }

  state.lastSyncAt = Date.now()
  state.lastSyncDirection = 'outgoing'
  state.lastBatchSize = paramCount
  state.lastBatchSourceSessionId = state.selfSessionId
  state.sentBatchCount += 1

  if (params && params.length > 0) {
    updateParameterList(params)
    if (state.selfSessionId) {
      updateParticipantParams(state.selfSessionId, params)
    }
    state.lastSyncParamName = extractShortParamName(params[0].path)
  }
}

export function applyRemoteParamEdit(payload: OutboundRemoteParamEditPayload): void {
  if (payload.roomCode !== state.roomCode) {
    return
  }

  updateParticipantParams(payload.targetSessionId, payload.params)
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
  state.filterBlacklistPaths = [...defaultRoomSettings.filterBlacklistPaths]
  state.sessionStatus = state.displayName ? SESSION_STATUSES.named : SESSION_STATUSES.idle
  state.lastSyncAt = null
  state.lastSyncDirection = null
  state.lastBatchSize = 0
  state.lastBatchSourceSessionId = null
  state.sentBatchCount = 0
  state.receivedBatchCount = 0
  state.errorState = null
  state.parameterList = []
  state.lastSyncParamName = null
  state.selfAvatarId = null
  state.ownerAvatarId = null
  state.avatarSyncActive = false
  state.participantParams = {}
  syncToggles.clear()
  // Note: inputSendEnabled and inputReceiveEnabled are intentionally NOT reset
  // — they are user preferences that persist across rooms
}

export function applyAvatarIdUpdated(payload: AvatarIdUpdatedPayload): void {
  if (!state.roomCode) {
    return
  }

  // Update participant's avatarId
  state.participantList = state.participantList.map((p) =>
    p.sessionId === payload.sessionId ? { ...p, avatarId: payload.avatarId } : p
  )

  // If the session is the owner, update ownerAvatarId
  if (payload.sessionId === state.ownerSessionId) {
    state.ownerAvatarId = payload.avatarId
    state.avatarSyncActive = computeAvatarSyncActive()
  }

  // If the session is us, update selfAvatarId
  if (payload.sessionId === state.selfSessionId) {
    state.selfAvatarId = payload.avatarId
    state.avatarSyncActive = computeAvatarSyncActive()
  }
}

export function applySelfAvatarChange(avatarId: string): void {
  state.selfAvatarId = avatarId
  state.parameterList = []
  state.lastSyncParamName = null
  state.avatarSyncActive = computeAvatarSyncActive()
  syncToggles.clear()
}

export function setParamSyncEnabled(path: string, enabled: boolean): void {
  syncToggles.set(path, enabled)

  state.parameterList = state.parameterList.map((entry) =>
    entry.path === path ? { ...entry, syncEnabled: enabled } : entry
  )
}

export function setLocalPlaybackEnabled(enabled: boolean): void {
  state.localPlaybackEnabled = enabled
}

export function setInputSendEnabled(enabled: boolean): void {
  state.inputSendEnabled = enabled
}

export function isInputSendEnabled(): boolean {
  return state.inputSendEnabled
}

export function setInputReceiveEnabled(enabled: boolean): void {
  state.inputReceiveEnabled = enabled
}

export function isInputReceiveEnabled(): boolean {
  return state.inputReceiveEnabled
}

export function setTrackingSendEnabled(enabled: boolean): void {
  state.trackingSendEnabled = enabled
}

export function isTrackingSendEnabled(): boolean {
  return state.trackingSendEnabled
}

export function setTrackingReceiveEnabled(enabled: boolean): void {
  state.trackingReceiveEnabled = enabled
}

export function isTrackingReceiveEnabled(): boolean {
  return state.trackingReceiveEnabled
}

export function updateTrackingSendSlots(addresses: string[]): void {
  const existing = new Map(state.trackingSendSlots.map((s) => [s.address, s.enabled]))
  state.trackingSendSlots = addresses.map((address) => ({
    address,
    enabled: existing.get(address) ?? true
  }))
}

export function toggleTrackingSendSlot(address: string, enabled: boolean): void {
  const slot = state.trackingSendSlots.find((s) => s.address === address)
  if (slot) {
    slot.enabled = enabled
  }
}

export function updateTrackingReceiveSlots(addresses: string[]): void {
  const existing = new Map(state.trackingReceiveSlots.map((s) => [s.address, s.enabled]))
  state.trackingReceiveSlots = addresses.map((address) => ({
    address,
    enabled: existing.get(address) ?? true
  }))
}

export function toggleTrackingReceiveSlot(address: string, enabled: boolean): void {
  const slot = state.trackingReceiveSlots.find((s) => s.address === address)
  if (slot) {
    slot.enabled = enabled
  }
}

export function getDisabledSendSlotAddresses(): Set<string> {
  return new Set(state.trackingSendSlots.filter((s) => !s.enabled).map((s) => s.address))
}

export function getDisabledReceiveSlotAddresses(): Set<string> {
  return new Set(state.trackingReceiveSlots.filter((s) => !s.enabled).map((s) => s.address))
}

export function isParamSyncEnabled(path: string): boolean {
  return syncToggles.get(path) ?? true
}

export function shouldApplyRemoteParam(path: string): boolean {
  if (!state.localPlaybackEnabled) {
    return false
  }

  if (!state.avatarSyncActive) {
    return false
  }

  if (!isParamSyncEnabled(path)) {
    return false
  }

  return passesFilter(path)
}

function passesFilter(path: string): boolean {
  if (state.filterMode === FILTER_MODES.allowAll) {
    return true
  }

  if (state.filterMode === FILTER_MODES.whitelist) {
    if (state.filterPaths.length === 0) return true
    return picomatch(state.filterPaths, { windows: false })(path)
  }

  if (state.filterMode === FILTER_MODES.blacklist) {
    if (state.filterPaths.length === 0) return true
    return !picomatch(state.filterPaths, { windows: false })(path)
  }

  // combined: whitelist first, then blacklist
  let allowed = true
  if (state.filterPaths.length > 0) {
    allowed = picomatch(state.filterPaths, { windows: false })(path)
  }
  if (allowed && state.filterBlacklistPaths.length > 0) {
    allowed = !picomatch(state.filterBlacklistPaths, { windows: false })(path)
  }
  return allowed
}

export { passesFilter }

function updateParameterList(params: ParamValue[]): void {
  const now = Date.now()
  const entries = new Map<string, ParamEntry>()
  const filtered = params.filter((p) => passesFilter(p.path))

  // Existing entries (re-filter in case filter changed)
  for (const entry of state.parameterList) {
    if (passesFilter(entry.path)) {
      entries.set(entry.path, entry)
    }
  }

  // Merge new params
  for (const param of filtered) {
    const existing = entries.get(param.path)
    entries.set(param.path, {
      path: param.path,
      valueType: param.valueType,
      value: param.value,
      updatedAt: now,
      syncEnabled: existing?.syncEnabled ?? (syncToggles.get(param.path) ?? true)
    })
  }

  // Sort by updatedAt descending, limit to PARAM_LIST_MAX_SIZE
  state.parameterList = [...entries.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, PARAM_LIST_MAX_SIZE)
}

function extractShortParamName(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

function computeAvatarSyncActive(): boolean {
  if (!state.selfAvatarId || !state.ownerAvatarId) {
    return false
  }

  return state.selfAvatarId === state.ownerAvatarId
}

function updateParticipantParams(sessionId: string, params: ParamValue[]): void {
  const now = Date.now()
  const existing = state.participantParams[sessionId] ?? []
  const entries = new Map<string, ParamEntry>()
  const filtered = params.filter((p) => passesFilter(p.path))

  for (const entry of existing) {
    if (passesFilter(entry.path)) {
      entries.set(entry.path, entry)
    }
  }

  for (const param of filtered) {
    entries.set(param.path, {
      path: param.path,
      valueType: param.valueType,
      value: param.value,
      updatedAt: now,
      syncEnabled: true
    })
  }

  state.participantParams[sessionId] = [...entries.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, PARAM_LIST_MAX_SIZE)
}