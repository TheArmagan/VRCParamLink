import type { ServerWebSocket } from 'bun'
import {
	CLIENT_EVENT_TYPES,
	ERROR_CODES,
	HEARTBEAT_INTERVAL_MS,
	HEARTBEAT_TIMEOUT_MS,
	RECONNECT_GRACE_MS,
	SERVER_EVENT_TYPES,
	type HelloAckPayload,
	type ParticipantJoinedPayload
} from '../../../shared/src/index.ts'
import {
	createEnvelope,
	isCreateRoomPayload,
	isEmptyPayload,
	isHeartbeatPayload,
	isHelloPayload,
	isJoinRoomPayload,
	isParamBatchPayload,
	isSetDisplayNamePayload,
	isSetRoomSettingsPayload,
	parseSocketEnvelope
} from './protocol.ts'
import { broadcastToRoom, handleDomainError, sendEnvelope, sendError } from './ws-messaging.ts'
import type { SocketRegistry } from './ws-state.ts'
import type { ConnectionContext } from './ws-types.ts'

type ParsedSocketEnvelope = NonNullable<ReturnType<typeof parseSocketEnvelope>>

export function createSocketHandlers(registry: SocketRegistry) {
	function handleMessage(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		switch (envelope.type) {
			case CLIENT_EVENT_TYPES.hello:
				handleHello(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.createRoom:
				handleCreateRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.joinRoom:
				handleJoinRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.leaveRoom:
				handleLeaveRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.setDisplayName:
				handleSetDisplayName(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.takeOwner:
				handleTakeOwner(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.setRoomSettings:
				handleSetRoomSettings(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.paramBatch:
				handleParamBatch(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.heartbeat:
				handleHeartbeat(ws, envelope)
				break
			default:
				sendError(
					ws,
					ERROR_CODES.unsupportedEvent,
					`Event ${envelope.type} is not implemented yet.`,
					envelope.requestId,
					{ supportedInThisPhase: [CLIENT_EVENT_TYPES.hello, CLIENT_EVENT_TYPES.heartbeat] }
				)
		}
	}

	function handleDisconnect(ws: ServerWebSocket<ConnectionContext>): void {
		if (!ws.data.sessionId || !ws.data.roomCode) {
			return
		}

		try {
			const result = registry.roomManager.leaveRoom(ws.data.sessionId, 'disconnect')
			broadcastToRoom(
				registry,
				result.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.participantLeft, result.leftPayload),
				ws.data.sessionId
			)

			if (result.ownerChangedPayload) {
				broadcastToRoom(registry, result.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload))
			}
		} catch (error) {
			console.error('[ws] disconnect cleanup failed', error)
		}
	}

	return {
		handleMessage,
		handleDisconnect
	}

	function handleHello(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isHelloPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid hello payload.', envelope.requestId)
			return
		}

		ws.data.displayName = envelope.payload.displayName.trim()
		ws.data.sessionId = crypto.randomUUID()
		ws.data.didHandshake = true
		ws.data.lastHeartbeatAt = Date.now()
		registry.sessionSockets.set(ws.data.sessionId, ws)

		const payload: HelloAckPayload = {
			sessionId: ws.data.sessionId,
			reconnectGraceMs: RECONNECT_GRACE_MS,
			heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
			heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
			resumed: false
		}

		sendEnvelope(ws, SERVER_EVENT_TYPES.helloAck, payload, envelope.requestId)
	}

	function handleCreateRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isCreateRoomPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid create_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId || !ws.data.displayName) {
			sendError(ws, ERROR_CODES.invalidMessage, 'hello handshake is required before room actions.', envelope.requestId)
			return
		}

		try {
			const payload = registry.roomManager.createRoom(ws.data.sessionId, ws.data.displayName, envelope.payload.settings)
			ws.data.roomCode = payload.roomCode
			sendEnvelope(ws, SERVER_EVENT_TYPES.roomJoined, payload, envelope.requestId)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleJoinRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isJoinRoomPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid join_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId || !ws.data.displayName) {
			sendError(ws, ERROR_CODES.invalidMessage, 'hello handshake is required before room actions.', envelope.requestId)
			return
		}

		try {
			const payload = registry.roomManager.joinRoom(ws.data.sessionId, ws.data.displayName, envelope.payload.roomCode)
			ws.data.roomCode = payload.roomCode
			sendEnvelope(ws, SERVER_EVENT_TYPES.roomJoined, payload, envelope.requestId)

			const participant = payload.participants.find((entry) => entry.sessionId === ws.data.sessionId)
			if (participant) {
				broadcastToRoom(
					registry,
					payload.roomCode,
					createEnvelope<ParticipantJoinedPayload>(SERVER_EVENT_TYPES.participantJoined, {
						roomCode: payload.roomCode,
						participant
					}),
					ws.data.sessionId
				)
			}
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleLeaveRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isEmptyPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid leave_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const result = registry.roomManager.leaveRoom(ws.data.sessionId, 'leave')
			ws.data.roomCode = null
			sendEnvelope(ws, SERVER_EVENT_TYPES.participantLeft, result.leftPayload, envelope.requestId)
			broadcastToRoom(
				registry,
				result.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.participantLeft, result.leftPayload),
				ws.data.sessionId
			)

			if (result.ownerChangedPayload) {
				broadcastToRoom(registry, result.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload))
			}
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleSetDisplayName(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isSetDisplayNamePayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid set_display_name payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = registry.roomManager.updateDisplayName(ws.data.sessionId, envelope.payload.displayName.trim())
			ws.data.displayName = payload.displayName
			broadcastToRoom(
				registry,
				payload.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.displayNameUpdated, payload, envelope.requestId)
			)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleTakeOwner(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isEmptyPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid take_owner payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = registry.roomManager.takeOwner(ws.data.sessionId)
			broadcastToRoom(registry, payload.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, payload, envelope.requestId))
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleSetRoomSettings(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isSetRoomSettingsPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid set_room_settings payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = registry.roomManager.updateRoomSettings(ws.data.sessionId, envelope.payload)
			broadcastToRoom(
				registry,
				payload.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.roomSettingsUpdated, payload, envelope.requestId)
			)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleParamBatch(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isParamBatchPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid param_batch payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const result = registry.roomManager.handleParamBatch(ws.data.sessionId, envelope.payload)
			if (!result) {
				return
			}

			if (result.ownerChangedPayload) {
				broadcastToRoom(
					registry,
					result.ownerChangedPayload.roomCode,
					createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload)
				)
			}

			broadcastToRoom(
				registry,
				result.outboundPayload.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.paramBatch, result.outboundPayload),
				ws.data.sessionId
			)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	function handleHeartbeat(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): void {
		if (!isHeartbeatPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid heartbeat payload.', envelope.requestId)
			return
		}

		ws.data.lastHeartbeatAt = Date.now()
	}
}