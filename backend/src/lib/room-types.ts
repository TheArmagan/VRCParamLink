import type {
  OutboundParamBatchPayload,
  OwnerChangedPayload,
  ParamValue,
  ParticipantLeftPayload,
  RoomSettings
} from '../../../shared/src/index.ts'

export type RoomRecord = {
  roomCode: string
  ownerSessionId: string
  settings: RoomSettings
  participants: Map<string, import('../../../shared/src/index.ts').Participant>
  joinOrder: string[]
  snapshot: ParamValue[]
}

export type HandleParamBatchResult = {
  outboundPayload: OutboundParamBatchPayload
  ownerChangedPayload?: OwnerChangedPayload
}

export type LeaveRoomResult = {
  leftPayload: ParticipantLeftPayload
  ownerChangedPayload?: OwnerChangedPayload
  roomCode: string
  deletedRoom: boolean
}