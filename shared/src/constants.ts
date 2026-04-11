export const APP_NAME = 'VRCParamLink'
export const APP_WINDOW_WIDTH = 400
export const APP_WINDOW_HEIGHT = 600

export const REDIS_PREFIX = 'vrcpl:'
export const ROOM_CODE_LENGTH = 16
export const ROOM_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const ROOM_MAX_PARTICIPANTS = 8
export const PARAM_BATCH_INTERVAL_MS = 150
export const RECONNECT_GRACE_MS = 10_000
export const HEARTBEAT_INTERVAL_MS = 5_000
export const HEARTBEAT_TIMEOUT_MS = 10_000
export const SUPPORTED_OSC_PREFIX = '/avatar'
export const DEFAULT_OSC_HOST = '127.0.0.1'
export const DEFAULT_OSC_INBOUND_PORT = 9001
export const DEFAULT_OSC_OUTBOUND_PORT = 9000
export const OSC_ECHO_SUPPRESSION_MS = 800
export const DEFAULT_BACKEND_PORT = 30_01
export const DEFAULT_BACKEND_URL = `ws://127.0.0.1:${DEFAULT_BACKEND_PORT}`

export const FILTER_MODES = {
  allowAll: 'allow_all',
  whitelist: 'whitelist',
  blacklist: 'blacklist'
} as const

export const CONNECTION_STATES = {
  idle: 'idle',
  connecting: 'connecting',
  connected: 'connected',
  disconnected: 'disconnected',
  error: 'error'
} as const

export const SESSION_STATUSES = {
  idle: 'idle',
  named: 'named',
  inRoom: 'in_room'
} as const

export const APP_SCREENS = {
  welcome: 'welcome',
  room: 'room'
} as const

export const ERROR_CODES = {
  invalidMessage: 'INVALID_MESSAGE',
  unsupportedEvent: 'UNSUPPORTED_EVENT',
  displayNameRequired: 'DISPLAY_NAME_REQUIRED',
  displayNameInUse: 'DISPLAY_NAME_IN_USE',
  displayNameUpdateFailed: 'DISPLAY_NAME_UPDATE_FAILED',
  invalidRoomCode: 'INVALID_ROOM_CODE',
  roomNotFound: 'ROOM_NOT_FOUND',
  roomFull: 'ROOM_FULL',
  notInRoom: 'NOT_IN_ROOM',
  notOwner: 'NOT_OWNER',
  ownerTakeoverDisabled: 'OWNER_TAKEOVER_DISABLED',
  invalidFilterMode: 'INVALID_FILTER_MODE',
  invalidFilterPath: 'INVALID_FILTER_PATH',
  invalidParamPath: 'INVALID_PARAM_PATH',
  unsupportedParamType: 'UNSUPPORTED_PARAM_TYPE',
  payloadTooLarge: 'PAYLOAD_TOO_LARGE',
  rateLimited: 'RATE_LIMITED',
  sessionNotResumable: 'SESSION_NOT_RESUMABLE'
} as const

export const IPC_CHANNELS = {
  closeWindow: 'app:close-window',
  getState: 'app:get-state',
  updateDisplayName: 'app:update-display-name',
  createRoom: 'app:create-room',
  joinRoom: 'app:join-room',
  leaveRoom: 'app:leave-room',
  takeOwner: 'app:take-owner',
  updateRoomSettings: 'app:update-room-settings',
  stateChanged: 'app:state-changed'
} as const

const ROOM_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`)

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value))
}

export function isSupportedOscPath(path: string): boolean {
  return path.startsWith(SUPPORTED_OSC_PREFIX)
}

export function createDefaultRoomSettings() {
  return {
    autoOwnerEnabled: false,
    instantOwnerTakeoverEnabled: true,
    filterMode: FILTER_MODES.allowAll,
    filterPaths: []
  }
}