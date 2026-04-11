import type {
  OutboundParamBatchPayload,
  OwnerChangedPayload,
  ParamValue,
  ParticipantLeftPayload
} from '../../../shared/src/index.ts'

export type HandleParamBatchResult = {
  /** Immediate outbound batch (stable params only). Null if all params were throttled. */
  outboundPayload: OutboundParamBatchPayload | null
  ownerChangedPayload?: OwnerChangedPayload
}

export type ThrottledFlushEntry = {
  roomCode: string
  sourceSessionId: string
  params: ParamValue[]
}

export type LeaveRoomResult = {
  leftPayload: ParticipantLeftPayload
  ownerChangedPayload?: OwnerChangedPayload
  roomCode: string
  deletedRoom: boolean
}