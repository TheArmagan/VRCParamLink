import type {
  APP_SCREENS,
  CONNECTION_STATES,
  ERROR_CODES,
  FILTER_MODES,
  SESSION_STATUSES
} from './constants.ts'
import type { ClientEventType, ServerEventType, SocketEventType } from './events.ts'

export type FilterMode = (typeof FILTER_MODES)[keyof typeof FILTER_MODES]
export type ConnectionState = (typeof CONNECTION_STATES)[keyof typeof CONNECTION_STATES]
export type SessionStatus = (typeof SESSION_STATUSES)[keyof typeof SESSION_STATUSES]
export type AppScreen = (typeof APP_SCREENS)[keyof typeof APP_SCREENS]
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
export type ParamValueType = 'bool' | 'int' | 'float'
export type OwnerChangeReason = 'manual' | 'auto_owner' | 'owner_left' | 'resume_conflict'
export type ParticipantLeaveReason = 'leave' | 'disconnect' | 'expired'
export type SyncDirection = 'incoming' | 'outgoing' | null

export interface ParamValue {
  path: string
  valueType: ParamValueType
  value: boolean | number
}

export interface RoomSettings {
  autoOwnerEnabled: boolean
  instantOwnerTakeoverEnabled: boolean
  filterMode: FilterMode
  filterPaths: string[]
}

export interface Participant {
  sessionId: string
  displayName: string
  joinedAt: number
  connected: boolean
  avatarId: string | null
}

export interface ErrorState {
  code: ErrorCode | string
  message: string
  details?: unknown
}

export interface SocketEnvelope<TPayload = unknown> {
  type: SocketEventType | string
  requestId?: string
  ts: number
  payload: TPayload
}

export interface HelloPayload {
  displayName: string
  clientVersion: string
  resumeSessionId?: string
  resumeRoomCode?: string
}

export interface HelloAckPayload {
  sessionId: string
  reconnectGraceMs: number
  heartbeatIntervalMs: number
  heartbeatTimeoutMs: number
  resumed: boolean
}

export interface CreateRoomPayload {
  settings?: Partial<RoomSettings>
}

export interface JoinRoomPayload {
  roomCode: string
}

export interface SetDisplayNamePayload {
  displayName: string
}

export interface SetRoomSettingsPayload extends Partial<RoomSettings> { }

export interface ParamBatchPayload {
  batchSeq: number
  params: ParamValue[]
}

export interface HeartbeatPayload {
  roomCode?: string
}

export interface AvatarChangePayload {
  avatarId: string
}

export interface AvatarIdUpdatedPayload {
  roomCode: string
  sessionId: string
  avatarId: string
}

export interface ParamEntry {
  path: string
  valueType: ParamValueType
  value: boolean | number
  updatedAt: number
  syncEnabled: boolean
}

export interface RoomJoinedPayload {
  roomCode: string
  selfSessionId: string
  ownerSessionId: string
  settings: RoomSettings
  participants: Participant[]
  snapshot: ParamValue[]
  ownerAvatarId: string | null
}

export interface RoomSettingsUpdatedPayload {
  roomCode: string
  updatedBySessionId: string
  settings: RoomSettings
}

export interface ParticipantJoinedPayload {
  roomCode: string
  participant: Participant
}

export interface ParticipantLeftPayload {
  roomCode: string
  sessionId: string
  displayName: string
  reason: ParticipantLeaveReason
}

export interface DisplayNameUpdatedPayload {
  roomCode: string
  sessionId: string
  previousDisplayName: string
  displayName: string
}

export interface OwnerChangedPayload {
  roomCode: string
  ownerSessionId: string
  previousOwnerSessionId: string | null
  reason: OwnerChangeReason
}

export interface OutboundParamBatchPayload {
  roomCode: string
  sourceSessionId: string
  batchSeq: number
  params: ParamValue[]
  forceApply?: boolean
}

export interface RemoteParamEditPayload {
  targetSessionId: string
  params: ParamValue[]
}

export interface OutboundRemoteParamEditPayload {
  roomCode: string
  sourceSessionId: string
  targetSessionId: string
  params: ParamValue[]
}

export interface ErrorPayload extends ErrorState {
  requestId?: string
}

export interface RendererAppState {
  appName: string
  appVersion: string
  screen: AppScreen
  selfSessionId: string | null
  displayName: string
  roomCode: string
  participantList: Participant[]
  ownerSessionId: string | null
  autoOwnerEnabled: boolean
  instantOwnerTakeoverEnabled: boolean
  filterMode: FilterMode
  filterPaths: string[]
  connectionState: ConnectionState
  sessionStatus: SessionStatus
  lastSyncAt: number | null
  lastSyncDirection: SyncDirection
  lastBatchSize: number
  lastBatchSourceSessionId: string | null
  sentBatchCount: number
  receivedBatchCount: number
  errorState: ErrorState | null
  parameterList: ParamEntry[]
  lastSyncParamName: string | null
  selfAvatarId: string | null
  ownerAvatarId: string | null
  avatarSyncActive: boolean
  localPlaybackEnabled: boolean
  participantParams: Record<string, ParamEntry[]>
}

export type AppActionResult =
  | { ok: true; state: RendererAppState }
  | { ok: false; error: ErrorState }

export type UpdateDisplayNameResult = AppActionResult

export interface DesktopApi {
  closeWindow: () => Promise<void>
  getAppState: () => Promise<RendererAppState>
  updateDisplayName: (displayName: string) => Promise<UpdateDisplayNameResult>
  createRoom: () => Promise<AppActionResult>
  joinRoom: (roomCode: string) => Promise<AppActionResult>
  leaveRoom: () => Promise<AppActionResult>
  takeOwner: () => Promise<AppActionResult>
  updateRoomSettings: (settings: Partial<RoomSettings>) => Promise<AppActionResult>
  toggleParamSync: (path: string, enabled: boolean) => Promise<void>
  toggleLocalPlayback: (enabled: boolean) => Promise<void>
  editParam: (targetSessionId: string, param: ParamValue) => Promise<void>
  sendRemoteParamEdit: (targetSessionId: string, params: ParamValue[]) => Promise<void>
  sendAllParams: () => Promise<void>
  onStateChanged: (listener: (state: RendererAppState) => void) => () => void
}

export type ClientToServerMessage =
  | SocketEnvelope<HelloPayload>
  | SocketEnvelope<CreateRoomPayload>
  | SocketEnvelope<JoinRoomPayload>
  | SocketEnvelope<Record<string, never>>
  | SocketEnvelope<SetDisplayNamePayload>
  | SocketEnvelope<SetRoomSettingsPayload>
  | SocketEnvelope<ParamBatchPayload>
  | SocketEnvelope<HeartbeatPayload>
  | SocketEnvelope<AvatarChangePayload>
  | SocketEnvelope<RemoteParamEditPayload>

export type ServerToClientMessage =
  | SocketEnvelope<HelloAckPayload>
  | SocketEnvelope<RoomJoinedPayload>
  | SocketEnvelope<RoomJoinedPayload>
  | SocketEnvelope<RoomSettingsUpdatedPayload>
  | SocketEnvelope<ParticipantJoinedPayload>
  | SocketEnvelope<ParticipantLeftPayload>
  | SocketEnvelope<DisplayNameUpdatedPayload>
  | SocketEnvelope<OwnerChangedPayload>
  | SocketEnvelope<OutboundParamBatchPayload>
  | SocketEnvelope<AvatarIdUpdatedPayload>
  | SocketEnvelope<OutboundRemoteParamEditPayload>
  | SocketEnvelope<ErrorPayload>

export type TypedClientEvent = ClientEventType
export type TypedServerEvent = ServerEventType