export type ConnectionContext = {
	sessionId: string | null
	displayName: string | null
	roomCode: string | null
	didHandshake: boolean
	lastHeartbeatAt: number
}

export function createConnectionContext(): ConnectionContext {
	return {
		sessionId: null,
		displayName: null,
		roomCode: null,
		didHandshake: false,
		lastHeartbeatAt: Date.now()
	}
}