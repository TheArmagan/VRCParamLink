export const CLIENT_EVENT_TYPES = {
  hello: 'hello',
  createRoom: 'create_room',
  joinRoom: 'join_room',
  leaveRoom: 'leave_room',
  setDisplayName: 'set_display_name',
  takeOwner: 'take_owner',
  setRoomSettings: 'set_room_settings',
  paramBatch: 'param_batch',
  heartbeat: 'heartbeat',
  avatarChange: 'avatar_change'
} as const

export const SERVER_EVENT_TYPES = {
  helloAck: 'hello_ack',
  roomJoined: 'room_joined',
  roomState: 'room_state',
  roomSettingsUpdated: 'room_settings_updated',
  participantJoined: 'participant_joined',
  participantLeft: 'participant_left',
  displayNameUpdated: 'display_name_updated',
  ownerChanged: 'owner_changed',
  paramBatch: 'param_batch',
  avatarIdUpdated: 'avatar_id_updated',
  error: 'error'
} as const

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[keyof typeof CLIENT_EVENT_TYPES]
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[keyof typeof SERVER_EVENT_TYPES]
export type SocketEventType = ClientEventType | ServerEventType