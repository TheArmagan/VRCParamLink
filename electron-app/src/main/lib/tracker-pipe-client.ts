import net from 'net'
import type { TrackerEntry } from '../../../../shared/src/index.ts'

const PIPE_PATH = '\\\\.\\pipe\\vrcpl-tracking'
const MAGIC = Buffer.from([0x56, 0x50])
const MSG_POSE_UPDATE = 0x01
const MSG_RESET_ALL = 0x02
const MSG_SET_ORIGIN = 0x03
const RECONNECT_INTERVAL_MS = 2_000
const INITIAL_RETRY_INTERVAL_MS = 500
const INITIAL_RETRY_MAX_ATTEMPTS = 30

function addressToSlot(address: string): number {
  if (address.includes('/head')) return 0
  const match = address.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : -1
}

export class TrackerPipeClient {
  private socket: net.Socket | null = null
  private _connected = false
  private shouldBeConnected = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connecting = false

  get isConnected(): boolean {
    return this._connected
  }

  private attemptConnect(): Promise<boolean> {
    if (this._connected || this.connecting) return Promise.resolve(this._connected)
    this.connecting = true

    return new Promise((resolve) => {
      const socket = net.createConnection(PIPE_PATH)

      const onError = (): void => {
        socket.removeAllListeners()
        socket.destroy()
        this.connecting = false
        resolve(false)
      }

      socket.on('connect', () => {
        socket.removeAllListeners()
        this.socket = socket
        this._connected = true
        this.connecting = false

        socket.on('error', (err) => {
          console.error('[tracker-pipe] Socket error:', err.message)
          this.handleDisconnect()
        })
        socket.on('close', () => {
          this.handleDisconnect()
        })

        console.log('[tracker-pipe] Connected to driver')
        resolve(true)
      })

      socket.on('error', onError)
    })
  }

  private handleDisconnect(): void {
    this._connected = false
    this.socket = null

    if (this.shouldBeConnected) {
      console.log('[tracker-pipe] Connection lost, will reconnect in', RECONNECT_INTERVAL_MS, 'ms')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (!this.shouldBeConnected) return

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (!this.shouldBeConnected) return

      const ok = await this.attemptConnect()
      if (!ok && this.shouldBeConnected) {
        this.scheduleReconnect()
      }
    }, RECONNECT_INTERVAL_MS)
  }

  async connectWithRetry(maxAttempts = INITIAL_RETRY_MAX_ATTEMPTS, intervalMs = INITIAL_RETRY_INTERVAL_MS): Promise<boolean> {
    this.shouldBeConnected = true

    for (let i = 0; i < maxAttempts; i++) {
      if (!this.shouldBeConnected) return false
      const ok = await this.attemptConnect()
      if (ok) return true
      await new Promise((r) => setTimeout(r, intervalMs))
    }

    console.warn('[tracker-pipe] Initial connect failed after', maxAttempts, 'attempts — will keep retrying in background')
    this.scheduleReconnect()
    return false
  }

  sendTrackers(trackers: TrackerEntry[]): void {
    if (!this._connected || !this.socket) return

    const mapped: { slot: number; position: [number, number, number]; rotation: [number, number, number] }[] = []
    for (const t of trackers) {
      const slot = addressToSlot(t.address)
      if (slot >= 0 && slot < 9) {
        mapped.push({ slot, position: t.position, rotation: t.rotation })
      }
    }
    if (mapped.length === 0) return

    const count = mapped.length
    const buf = Buffer.alloc(4 + count * 25)

    // Header
    MAGIC.copy(buf, 0)
    buf[2] = MSG_POSE_UPDATE
    buf[3] = count

    let offset = 4
    for (const t of mapped) {
      buf[offset] = t.slot
      offset += 1
      buf.writeFloatLE(t.position[0], offset); offset += 4
      buf.writeFloatLE(t.position[1], offset); offset += 4
      buf.writeFloatLE(t.position[2], offset); offset += 4
      buf.writeFloatLE(t.rotation[0], offset); offset += 4
      buf.writeFloatLE(t.rotation[1], offset); offset += 4
      buf.writeFloatLE(t.rotation[2], offset); offset += 4
    }

    this.socket.write(buf)
  }

  sendReset(): void {
    if (!this._connected || !this.socket) return
    const buf = Buffer.alloc(4)
    MAGIC.copy(buf, 0)
    buf[2] = MSG_RESET_ALL
    buf[3] = 0
    this.socket.write(buf)
  }

  sendOrigin(position: [number, number, number], rotation: [number, number, number]): void {
    if (!this._connected || !this.socket) return
    // Header (4 bytes) + 6 floats (24 bytes)
    const buf = Buffer.alloc(28)
    MAGIC.copy(buf, 0)
    buf[2] = MSG_SET_ORIGIN
    buf[3] = 0
    let offset = 4
    buf.writeFloatLE(position[0], offset); offset += 4
    buf.writeFloatLE(position[1], offset); offset += 4
    buf.writeFloatLE(position[2], offset); offset += 4
    buf.writeFloatLE(rotation[0], offset); offset += 4
    buf.writeFloatLE(rotation[1], offset); offset += 4
    buf.writeFloatLE(rotation[2], offset); offset += 4
    this.socket.write(buf)
  }

  disconnect(): void {
    this.shouldBeConnected = false

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socket) {
      try { this.sendReset() } catch { /* ignore */ }
      this.socket.destroy()
      this.socket = null
      this._connected = false
      console.log('[tracker-pipe] Disconnected')
    }
  }
}
