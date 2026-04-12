import {
  CLIENT_EVENT_TYPES,
  CONNECTION_STATES,
  DEFAULT_BACKEND_URL,
  ERROR_CODES,
  HEARTBEAT_INTERVAL_MS,
  SERVER_EVENT_TYPES,
  type AppActionResult,
  type AvatarIdUpdatedPayload,
  type ClientToServerMessage,
  type DisplayNameUpdatedPayload,
  type ErrorPayload,
  type HelloAckPayload,
  type OutboundRemoteParamEditPayload,
  type OutboundTrackingBatchPayload,
  type OwnerChangedPayload,
  type OutboundParamBatchPayload,
  type ParamValue,
  type ParticipantJoinedPayload,
  type ParticipantLeftPayload,
  type RoomJoinedPayload,
  type RoomSettings,
  type RoomSettingsUpdatedPayload,
  type ServerToClientMessage,
  type SocketEnvelope,
  type TrackingBatchPayload
} from '../../../../shared/src/index.ts'
import {
  applyAvatarIdUpdated,
  applyDisplayNameUpdated,
  applyLocalParamBatch,
  applyOwnerChanged,
  applyParamBatch,
  applyParticipantJoined,
  applyParticipantLeft,
  applyRemoteParamEdit,
  applyRoomJoined,
  applyRoomSettingsUpdated,
  clearRoomState,
  getAppState,
  setConnectionState,
  setErrorState,
  setSelfSessionId
} from './app-state.ts'

type PendingRequest = {
  expectedTypes: Set<string>
  resolve: (result: AppActionResult) => void
}

type BackendClientOptions = {
  notifyStateChanged: () => void
  onRemoteParamBatch?: (payload: OutboundParamBatchPayload) => void
  onRemoteParamEdit?: (payload: OutboundRemoteParamEditPayload) => void
  onRemoteTrackingBatch?: (payload: OutboundTrackingBatchPayload) => void
  onRoomSnapshot?: (snapshot: ParamValue[]) => void
}

export class BackendClient {
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private connectPromise: Promise<AppActionResult> | null = null
  private requestCounter = 0
  private readonly pendingRequests = new Map<string, PendingRequest>()

  constructor(private readonly options: BackendClientOptions) { }

  async createRoom(): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.createRoom, {}, [SERVER_EVENT_TYPES.roomJoined])
  }

  async joinRoom(roomCode: string): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.joinRoom, { roomCode }, [SERVER_EVENT_TYPES.roomJoined])
  }

  async leaveRoom(): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.leaveRoom, {}, [SERVER_EVENT_TYPES.participantLeft])
  }

  async takeOwner(): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.takeOwner, {}, [SERVER_EVENT_TYPES.ownerChanged])
  }

  async updateRoomSettings(settings: Partial<RoomSettings>): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.setRoomSettings, settings, [SERVER_EVENT_TYPES.roomSettingsUpdated])
  }

  async updateDisplayName(displayName: string): Promise<AppActionResult> {
    return this.sendRequest(CLIENT_EVENT_TYPES.setDisplayName, { displayName }, [SERVER_EVENT_TYPES.displayNameUpdated])
  }

  async sendParamBatch(batchSeq: number, params: ParamValue[]): Promise<AppActionResult> {
    const state = getAppState()
    if (!state.roomCode || params.length === 0) {
      return { ok: true, state }
    }

    const connectionResult = await this.ensureConnected(state.displayName || 'Guest')
    if (!connectionResult.ok) {
      return connectionResult
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.invalidMessage,
          message: 'Backend socket is not connected.'
        }
      }
    }

    this.socket.send(JSON.stringify(createEnvelope(CLIENT_EVENT_TYPES.paramBatch, { batchSeq, params })))
    applyLocalParamBatch(params.length, params)
    this.options.notifyStateChanged()
    return { ok: true, state: getAppState() }
  }

  sendAvatarChange(avatarId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(JSON.stringify(createEnvelope(CLIENT_EVENT_TYPES.avatarChange, { avatarId })))
  }

  async sendRemoteParamEdit(targetSessionId: string, params: ParamValue[]): Promise<void> {
    const state = getAppState()
    if (!state.roomCode || params.length === 0) {
      return
    }

    const connectionResult = await this.ensureConnected(state.displayName || 'Guest')
    if (!connectionResult.ok) {
      return
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(JSON.stringify(createEnvelope(CLIENT_EVENT_TYPES.remoteParamEdit, { targetSessionId, params })))
  }

  sendTrackingBatch(batch: TrackingBatchPayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    const state = getAppState()
    if (!state.roomCode) {
      return
    }

    this.socket.send(JSON.stringify(createEnvelope(CLIENT_EVENT_TYPES.trackingBatch, batch)))
  }

  async ensureConnected(displayName: string): Promise<AppActionResult> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return { ok: true, state: getAppState() }
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    setConnectionState(CONNECTION_STATES.connecting)
    setErrorState(null)
    this.options.notifyStateChanged()

    this.connectPromise = new Promise<AppActionResult>((resolve) => {
      const socket = new WebSocket(DEFAULT_BACKEND_URL)
      this.socket = socket

      socket.addEventListener('open', async () => {
        const helloResult = await this.sendRequest(
          CLIENT_EVENT_TYPES.hello,
          {
            displayName,
            clientVersion: '0.1.0'
          },
          [SERVER_EVENT_TYPES.helloAck],
          true
        )

        resolve(helloResult)
      })

      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data)
      })

      socket.addEventListener('close', () => {
        this.handleSocketClose()
      })

      socket.addEventListener('error', () => {
        const error = {
          code: ERROR_CODES.invalidMessage,
          message: 'Backend WebSocket connection could not be established.'
        }

        setConnectionState(CONNECTION_STATES.error)
        setErrorState(error)
        this.options.notifyStateChanged()

        resolve({ ok: false, error })
      })
    }).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  private async sendRequest<TPayload>(
    type: ClientToServerMessage['type'],
    payload: TPayload,
    expectedTypes: string[],
    skipEnsureConnected = false
  ): Promise<AppActionResult> {
    if (!skipEnsureConnected) {
      const displayName = getAppState().displayName || 'Guest'
      const connectionResult = await this.ensureConnected(displayName)
      if (!connectionResult.ok) {
        return connectionResult
      }
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.invalidMessage,
          message: 'Backend socket is not connected.'
        }
      }
    }

    const requestId = `req_${Date.now()}_${this.requestCounter++}`
    const envelope = createEnvelope(type, payload, requestId) as SocketEnvelope<TPayload>

    return new Promise<AppActionResult>((resolve) => {
      this.pendingRequests.set(requestId, {
        expectedTypes: new Set(expectedTypes),
        resolve
      })

      this.socket?.send(JSON.stringify(envelope))
    })
  }

  private handleMessage(rawMessage: MessageEvent['data']): void {
    if (typeof rawMessage !== 'string') {
      return
    }

    const envelope = JSON.parse(rawMessage) as ServerToClientMessage
    switch (envelope.type) {
      case SERVER_EVENT_TYPES.helloAck: {
        const payload = envelope.payload as HelloAckPayload
        setConnectionState(CONNECTION_STATES.connected)
        setSelfSessionId(payload.sessionId)
        setErrorState(null)
        this.startHeartbeat()
        break
      }
      case SERVER_EVENT_TYPES.roomJoined:
      case SERVER_EVENT_TYPES.roomState: {
        const payload = envelope.payload as RoomJoinedPayload
        applyRoomJoined(payload)
        if (payload.snapshot.length > 0) {
          this.options.onRoomSnapshot?.(payload.snapshot)
        }
        break
      }
      case SERVER_EVENT_TYPES.participantJoined:
        applyParticipantJoined(envelope.payload as ParticipantJoinedPayload)
        break
      case SERVER_EVENT_TYPES.participantLeft:
        applyParticipantLeft(envelope.payload as ParticipantLeftPayload)
        break
      case SERVER_EVENT_TYPES.displayNameUpdated:
        applyDisplayNameUpdated(envelope.payload as DisplayNameUpdatedPayload)
        break
      case SERVER_EVENT_TYPES.ownerChanged:
        applyOwnerChanged(envelope.payload as OwnerChangedPayload)
        break
      case SERVER_EVENT_TYPES.roomSettingsUpdated:
        applyRoomSettingsUpdated(envelope.payload as RoomSettingsUpdatedPayload)
        break
      case SERVER_EVENT_TYPES.paramBatch:
        applyParamBatch(envelope.payload as OutboundParamBatchPayload)
        this.options.onRemoteParamBatch?.(envelope.payload as OutboundParamBatchPayload)
        break
      case SERVER_EVENT_TYPES.avatarIdUpdated:
        applyAvatarIdUpdated(envelope.payload as AvatarIdUpdatedPayload)
        break
      case SERVER_EVENT_TYPES.remoteParamEdit: {
        const remoteEditPayload = envelope.payload as OutboundRemoteParamEditPayload
        applyRemoteParamEdit(remoteEditPayload)
        this.options.onRemoteParamEdit?.(remoteEditPayload)
        break
      }
      case SERVER_EVENT_TYPES.trackingBatch:
        this.options.onRemoteTrackingBatch?.(envelope.payload as OutboundTrackingBatchPayload)
        break
      case SERVER_EVENT_TYPES.error:
        setErrorState(envelope.payload as ErrorPayload)
        break
      default:
        break
    }

    this.options.notifyStateChanged()
    this.resolvePendingRequest(envelope)
  }

  private resolvePendingRequest(envelope: ServerToClientMessage): void {
    const requestId = envelope.requestId
    if (!requestId) {
      return
    }

    const pendingRequest = this.pendingRequests.get(requestId)
    if (!pendingRequest || !pendingRequest.expectedTypes.has(envelope.type)) {
      return
    }

    this.pendingRequests.delete(requestId)

    if (envelope.type === SERVER_EVENT_TYPES.error) {
      pendingRequest.resolve({ ok: false, error: envelope.payload as ErrorPayload })
      return
    }

    pendingRequest.resolve({ ok: true, state: getAppState() })
  }

  private handleSocketClose(): void {
    this.socket = null
    this.stopHeartbeat()
    setConnectionState(CONNECTION_STATES.disconnected)

    if (getAppState().roomCode) {
      clearRoomState()
    }

    const error = {
      code: ERROR_CODES.sessionNotResumable,
      message: 'Backend connection closed. Rejoin the room after reconnecting.'
    }

    setErrorState(error)
    this.options.notifyStateChanged()

    for (const [requestId, pendingRequest] of this.pendingRequests) {
      pendingRequest.resolve({ ok: false, error })
      this.pendingRequests.delete(requestId)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return
      }

      this.socket.send(
        JSON.stringify(
          createEnvelope(CLIENT_EVENT_TYPES.heartbeat, {
            roomCode: getAppState().roomCode || undefined
          })
        )
      )
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

function createEnvelope<TPayload>(type: string, payload: TPayload, requestId?: string): SocketEnvelope<TPayload> {
  return {
    type,
    requestId,
    ts: Date.now(),
    payload
  }
}