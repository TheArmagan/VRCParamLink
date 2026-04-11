import type { ServerWebSocket } from 'bun'
import {
	DEFAULT_BACKEND_PORT,
	ERROR_CODES,
	HEARTBEAT_INTERVAL_MS,
	HEARTBEAT_TIMEOUT_MS,
	RAPID_PARAM_THROTTLE_MS,
	SERVER_EVENT_TYPES
} from '../../shared/src/index.ts'
import { createEnvelope, parseSocketEnvelope, requiresHandshake } from './lib/protocol.ts'
import { connectRedis } from './lib/redis-client.ts'
import { createSocketHandlers } from './lib/ws-handlers.ts'
import { broadcastToRoom, sendError } from './lib/ws-messaging.ts'
import { createSocketRegistry } from './lib/ws-state.ts'
import { createConnectionContext, type ConnectionContext } from './lib/ws-types.ts'

const redis = await connectRedis()
const registry = createSocketRegistry(redis)
const socketHandlers = createSocketHandlers(registry)
const port = Number(Bun.env.PORT ?? DEFAULT_BACKEND_PORT)

const server = Bun.serve<ConnectionContext>({
	port,
	fetch(req, serverInstance) {
		if (serverInstance.upgrade(req, { data: createConnectionContext() })) {
			return undefined
		}

		return new Response('VRCParamLink WebSocket server is running.', {
			status: 200,
			headers: {
				'content-type': 'text/plain; charset=utf-8'
			}
		})
	},
	websocket: {
		open(ws) {
			registry.sockets.add(ws)
			console.log('[ws] connection opened')
		},
		message(ws, message) {
			const envelope = parseSocketEnvelope(message)

			if (!envelope) {
				sendError(ws, ERROR_CODES.invalidMessage, 'Malformed socket envelope.')
				return
			}

			if (requiresHandshake(envelope.type) && !ws.data.didHandshake) {
				sendError(ws, ERROR_CODES.invalidMessage, 'hello must be the first client event.', envelope.requestId)
				return
			}

			socketHandlers.handleMessage(ws, envelope).catch((err) => {
				console.error('[ws] unhandled message error', err)
			})
		},
		close(ws, code, reason) {
			registry.sockets.delete(ws)
			if (ws.data.sessionId) {
				registry.sessionSockets.delete(ws.data.sessionId)
			}

			socketHandlers.handleDisconnect(ws).catch((err) => {
				console.error('[ws] disconnect cleanup failed', err)
			})
			console.log(`[ws] connection closed (${code}) ${reason}`)
		}
	}
})

setInterval(() => {
	const now = Date.now()

	for (const socket of registry.sockets) {
		if (now - socket.data.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) {
			continue
		}

		sendError(socket, ERROR_CODES.sessionNotResumable, 'Connection timed out because heartbeat was not received.')
		socket.close(4000, 'heartbeat_timeout')
	}
}, HEARTBEAT_INTERVAL_MS)

// Flush throttled rapid params periodically
setInterval(async () => {
	const entries = registry.roomManager.flushThrottledParams()
	for (const entry of entries) {
		try {
			await broadcastToRoom(
				registry,
				entry.roomCode,
				createEnvelope(SERVER_EVENT_TYPES.paramBatch, {
					roomCode: entry.roomCode,
					sourceSessionId: entry.sourceSessionId,
					batchSeq: 0,
					params: entry.params
				}),
				entry.sourceSessionId
			)
		} catch (err) {
			console.error('[throttle] flush broadcast failed', err)
		}
	}
}, RAPID_PARAM_THROTTLE_MS)

console.log(`[server] listening on ws://localhost:${server.port}`)
