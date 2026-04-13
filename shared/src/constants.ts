export const APP_NAME = 'VRCParamLink'
export const APP_WINDOW_WIDTH = 400
export const APP_WINDOW_HEIGHT = 600

export const REDIS_PREFIX = 'vrcpl:'
export const ROOM_CODE_LENGTH = 16
export const ROOM_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const ROOM_MAX_PARTICIPANTS = 8
export const PARAM_BATCH_INTERVAL_MS = 100
export const RAPID_PARAM_THROTTLE_MS = 2_000
export const RECONNECT_GRACE_MS = 10_000
export const HEARTBEAT_INTERVAL_MS = 5_000
export const HEARTBEAT_TIMEOUT_MS = 10_000
export const SUPPORTED_OSC_PREFIX = '/avatar'
export const INPUT_OSC_PREFIX = '/input/'
export const AVATAR_PARAMS_PREFIX = '/avatar/parameters/'
export const AVATAR_CHANGE_OSC_ADDRESS = '/avatar/change'
export const PARAM_LIST_MAX_SIZE = 250

/** All supported VRChat /input axes (float, -1 to 1) */
export const VRC_INPUT_AXES: readonly string[] = [
  '/input/Vertical',
  '/input/Horizontal',
  '/input/LookHorizontal',
  '/input/UseAxisRight',
  '/input/GrabAxisRight',
  '/input/MoveHoldFB',
  '/input/SpinHoldCwCcw',
  '/input/SpinHoldUD',
  '/input/SpinHoldLR'
] as const

/** All supported VRChat /input buttons (int, 1 = pressed, 0 = released) */
export const VRC_INPUT_BUTTONS: readonly string[] = [
  '/input/MoveForward',
  '/input/MoveBackward',
  '/input/MoveLeft',
  '/input/MoveRight',
  '/input/LookLeft',
  '/input/LookRight',
  '/input/Jump',
  '/input/Run',
  '/input/ComfortLeft',
  '/input/ComfortRight',
  '/input/DropRight',
  '/input/UseRight',
  '/input/GrabRight',
  '/input/DropLeft',
  '/input/UseLeft',
  '/input/GrabLeft',
  '/input/PanicButton',
  '/input/QuickMenuToggleLeft',
  '/input/QuickMenuToggleRight',
  '/input/Voice'
] as const

export const VRC_ALL_INPUTS: readonly string[] = [...VRC_INPUT_AXES, ...VRC_INPUT_BUTTONS] as const

/**
 * VRChat built-in avatar parameters that should never be synced.
 * These are player-specific (movement, tracking, etc.) and read-only.
 * @see https://creators.vrchat.com/avatars/animator-parameters/
 */
export const VRC_BUILTIN_PARAMS: ReadonlySet<string> = new Set([
  'IsLocal',
  'PreviewMode',
  'Viseme',
  'Voice',
  'GestureLeft',
  'GestureRight',
  'GestureLeftWeight',
  'GestureRightWeight',
  'AngularY',
  'VelocityX',
  'VelocityY',
  'VelocityZ',
  'VelocityMagnitude',
  'Upright',
  'Grounded',
  'Seated',
  'AFK',
  'TrackingType',
  'VRMode',
  'MuteSelf',
  'InStation',
  'Earmuffs',
  'IsOnFriendsList',
  'AvatarVersion',
  'IsAnimatorEnabled',
  'ScaleModified',
  'ScaleFactor',
  'ScaleFactorInverse',
  'EyeHeightAsMeters',
  'EyeHeightAsPercent',
  'Jump',
  'Mirror'
])

export const DEFAULT_OSC_HOST = '127.0.0.1'
export const DEFAULT_OSC_INBOUND_PORT = 9001
export const DEFAULT_OSC_OUTBOUND_PORT = 9000
export const OSC_ECHO_SUPPRESSION_MS = 800
export const DEFAULT_BACKEND_PORT = 3038
export const DEFAULT_BACKEND_URL = `wss://vrcpl-api.armagan.rest`

export const FILTER_MODES = {
  allowAll: 'allow_all',
  whitelist: 'whitelist',
  blacklist: 'blacklist',
  combined: 'combined'
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
  stateChanged: 'app:state-changed',
  toggleParamSync: 'app:toggle-param-sync',
  toggleLocalPlayback: 'app:toggle-local-playback',
  toggleInputSend: 'app:toggle-input-send',
  toggleInputReceive: 'app:toggle-input-receive',
  toggleTrackingSend: 'app:toggle-tracking-send',
  toggleTrackingReceive: 'app:toggle-tracking-receive',
  recalibrateTrackingReceive: 'app:recalibrate-tracking-receive',
  toggleTrackingSendSlot: 'app:toggle-tracking-send-slot',
  toggleTrackingReceiveSlot: 'app:toggle-tracking-receive-slot',
  editParam: 'app:edit-param',
  sendRemoteParamEdit: 'app:send-remote-param-edit',
  sendAllParams: 'app:send-all-params'
} as const

const ROOM_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`)

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value))
}

export function isSupportedOscPath(path: string): boolean {
  return path.startsWith(SUPPORTED_OSC_PREFIX) || path.startsWith(INPUT_OSC_PREFIX)
}

export function isInputOscPath(path: string): boolean {
  return path.startsWith(INPUT_OSC_PREFIX)
}

export function isBuiltinVrcParam(path: string): boolean {
  if (!path.startsWith(AVATAR_PARAMS_PREFIX)) return false
  const paramName = path.slice(AVATAR_PARAMS_PREFIX.length)
  return VRC_BUILTIN_PARAMS.has(paramName)
}

export function createDefaultRoomSettings() {
  return {
    autoOwnerEnabled: false,
    instantOwnerTakeoverEnabled: true,
    filterMode: FILTER_MODES.allowAll,
    filterPaths: [],
    filterBlacklistPaths: []
  }
}