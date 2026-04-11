import type {
  OutboundParamBatchPayload,
  OwnerChangedPayload,
  ParticipantLeftPayload
} from '../../../shared/src/index.ts'

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