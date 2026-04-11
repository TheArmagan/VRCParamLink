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
	async function handleMessage(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		switch (envelope.type) {
			case CLIENT_EVENT_TYPES.hello:
				await handleHello(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.createRoom:
				await handleCreateRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.joinRoom:
				await handleJoinRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.leaveRoom:
				await handleLeaveRoom(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.setDisplayName:
				await handleSetDisplayName(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.takeOwner:
				await handleTakeOwner(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.setRoomSettings:
				await handleSetRoomSettings(ws, envelope)
				break
			case CLIENT_EVENT_TYPES.paramBatch:
				await handleParamBatch(ws, envelope)
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

	async function handleDisconnect(ws: ServerWebSocket<ConnectionContext>): Promise<void> {
		if (!ws.data.sessionId || !ws.data.roomCode) {
			return
		}

		try {
			const result = await registry.roomManager.leaveRoom(ws.data.sessionId, 'disconnect')
			await broadcastToRoom(
				registry,
				result.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.participantLeft, result.leftPayload),
				ws.data.sessionId
			)

			if (result.ownerChangedPayload) {
				await broadcastToRoom(registry, result.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload))
			}
		} catch (error) {
			console.error('[ws] disconnect cleanup failed', error)
		}
	}

	return {
		handleMessage,
		handleDisconnect
	}

	async function handleHello(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
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

	async function handleCreateRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isCreateRoomPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid create_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId || !ws.data.displayName) {
			sendError(ws, ERROR_CODES.invalidMessage, 'hello handshake is required before room actions.', envelope.requestId)
			return
		}

		try {
			const payload = await registry.roomManager.createRoom(ws.data.sessionId, ws.data.displayName, envelope.payload.settings)
			ws.data.roomCode = payload.roomCode
			sendEnvelope(ws, SERVER_EVENT_TYPES.roomJoined, payload, envelope.requestId)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	async function handleJoinRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isJoinRoomPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid join_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId || !ws.data.displayName) {
			sendError(ws, ERROR_CODES.invalidMessage, 'hello handshake is required before room actions.', envelope.requestId)
			return
		}

		try {
			const payload = await registry.roomManager.joinRoom(ws.data.sessionId, ws.data.displayName, envelope.payload.roomCode)
			ws.data.roomCode = payload.roomCode
			sendEnvelope(ws, SERVER_EVENT_TYPES.roomJoined, payload, envelope.requestId)

			const participant = payload.participants.find((entry) => entry.sessionId === ws.data.sessionId)
			if (participant) {
				await broadcastToRoom(
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

	async function handleLeaveRoom(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isEmptyPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid leave_room payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const result = await registry.roomManager.leaveRoom(ws.data.sessionId, 'leave')
			ws.data.roomCode = null
			sendEnvelope(ws, SERVER_EVENT_TYPES.participantLeft, result.leftPayload, envelope.requestId)
			await broadcastToRoom(
				registry,
				result.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.participantLeft, result.leftPayload),
				ws.data.sessionId
			)

			if (result.ownerChangedPayload) {
				await broadcastToRoom(registry, result.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload))
			}
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	async function handleSetDisplayName(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isSetDisplayNamePayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid set_display_name payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = await registry.roomManager.updateDisplayName(ws.data.sessionId, envelope.payload.displayName.trim())
			ws.data.displayName = payload.displayName
			await broadcastToRoom(
				registry,
				payload.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.displayNameUpdated, payload, envelope.requestId)
			)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	async function handleTakeOwner(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isEmptyPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid take_owner payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = await registry.roomManager.takeOwner(ws.data.sessionId)
			await broadcastToRoom(registry, payload.roomCode, createEnvelope(SERVER_EVENT_TYPES.ownerChanged, payload, envelope.requestId))
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	async function handleSetRoomSettings(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isSetRoomSettingsPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid set_room_settings payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const payload = await registry.roomManager.updateRoomSettings(ws.data.sessionId, envelope.payload)
			await broadcastToRoom(
				registry,
				payload.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.roomSettingsUpdated, payload, envelope.requestId)
			)
		} catch (error) {
			handleDomainError(ws, error, envelope.requestId)
		}
	}

	async function handleParamBatch(ws: ServerWebSocket<ConnectionContext>, envelope: ParsedSocketEnvelope): Promise<void> {
		if (!isParamBatchPayload(envelope.payload)) {
			sendError(ws, ERROR_CODES.invalidMessage, 'Invalid param_batch payload.', envelope.requestId)
			return
		}

		if (!ws.data.sessionId) {
			sendError(ws, ERROR_CODES.invalidMessage, 'No active session found.', envelope.requestId)
			return
		}

		try {
			const result = await registry.roomManager.handleParamBatch(ws.data.sessionId, envelope.payload)
			if (!result) {
				return
			}

			if (result.ownerChangedPayload) {
				await broadcastToRoom(
					registry,
					result.ownerChangedPayload.roomCode,
					createEnvelope(SERVER_EVENT_TYPES.ownerChanged, result.ownerChangedPayload)
				)
			}

			await broadcastToRoom(
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