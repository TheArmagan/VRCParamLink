import type { ServerWebSocket } from 'bun'
import { RoomManager } from './room-manager.ts'
import type { RedisClient } from './redis-client.ts'
import type { ConnectionContext } from './ws-types.ts'

export type SocketRegistry = {
	sockets: Set<ServerWebSocket<ConnectionContext>>
	sessionSockets: Map<string, ServerWebSocket<ConnectionContext>>
	roomManager: RoomManager
}

export function createSocketRegistry(redis: RedisClient): SocketRegistry {
	return {
		sockets: new Set<ServerWebSocket<ConnectionContext>>(),
		sessionSockets: new Map<string, ServerWebSocket<ConnectionContext>>(),
		roomManager: new RoomManager(redis)
	}
}