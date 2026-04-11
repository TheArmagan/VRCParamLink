import type { ServerWebSocket } from 'bun'
import {
	ERROR_CODES,
	SERVER_EVENT_TYPES,
	type ErrorPayload,
	type ServerToClientMessage,
	type SocketEnvelope
} from '../../../shared/src/index.ts'
import { createEnvelope } from './protocol.ts'
import { RoomManagerError } from './room-errors.ts'
import type { SocketRegistry } from './ws-state.ts'
import type { ConnectionContext } from './ws-types.ts'

export function sendError(
	ws: ServerWebSocket<ConnectionContext>,
	code: ErrorPayload['code'],
	message: string,
	requestId?: string,
	details?: unknown
): void {
	const payload: ErrorPayload = {
		code,
		message,
		requestId,
		details
	}

	ws.send(JSON.stringify(createEnvelope(SERVER_EVENT_TYPES.error, payload, requestId)))
}

export function sendEnvelope<TPayload>(
	ws: ServerWebSocket<ConnectionContext>,
	type: ServerToClientMessage['type'] | string,
	payload: TPayload,
	requestId?: string
): void {
	ws.send(JSON.stringify(createEnvelope(type, payload, requestId)))
}

export async function broadcastToRoom(
	registry: SocketRegistry,
	roomCode: string,
	envelope: SocketEnvelope<unknown>,
	excludedSessionId?: string | null
): Promise<void> {
	const sessionIds = await registry.roomManager.getParticipantSessionIds(roomCode)

	for (const sessionId of sessionIds) {
		if (excludedSessionId && sessionId === excludedSessionId) {
			continue
		}

		const socket = registry.sessionSockets.get(sessionId)
		if (socket) {
			socket.send(JSON.stringify(envelope))
		}
	}
}

export function handleDomainError(
	ws: ServerWebSocket<ConnectionContext>,
	error: unknown,
	requestId?: string
): void {
	if (error instanceof RoomManagerError) {
		sendError(ws, error.code, error.message, requestId, error.details)
		return
	}

	console.error('[ws] unexpected domain error', error)
	sendError(ws, ERROR_CODES.invalidMessage, 'Unexpected room domain error.', requestId)
}