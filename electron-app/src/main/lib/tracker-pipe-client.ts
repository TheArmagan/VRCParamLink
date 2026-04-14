import net from 'net'
import type { TrackerEntry } from '../../../../shared/src/index.ts'

const PIPE_PATH = '\\\\.\\pipe\\vrcpl-tracking'
const MAGIC = Buffer.from([0x56, 0x50])
const MSG_POSE_UPDATE = 0x01
const MSG_RESET_ALL = 0x02
const MSG_SET_ORIGIN = 0x03
const MSG_UPDATE_ORIGIN = 0x04
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
  // Pre-allocated buffers to avoid GC pressure on the hot path
  private readonly _poseBuf = Buffer.alloc(4 + 9 * 29) // max 9 trackers
  private readonly _originBuf = Buffer.alloc(32)

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

    // Write directly into pre-allocated buffer, skipping intermediate array
    const buf = this._poseBuf
    let count = 0
    let offset = 4
    for (const t of trackers) {
      const slot = addressToSlot(t.address)
      if (slot < 0 || slot >= 9) continue
      buf[offset] = slot
      offset += 1
      buf.writeFloatLE(t.position[0], offset); offset += 4
      buf.writeFloatLE(t.position[1], offset); offset += 4
      buf.writeFloatLE(t.position[2], offset); offset += 4
      buf.writeFloatLE(t.quaternion[0], offset); offset += 4
      buf.writeFloatLE(t.quaternion[1], offset); offset += 4
      buf.writeFloatLE(t.quaternion[2], offset); offset += 4
      buf.writeFloatLE(t.quaternion[3], offset); offset += 4
      count++
    }
    if (count === 0) return

    // Header
    MAGIC.copy(buf, 0)
    buf[2] = MSG_POSE_UPDATE
    buf[3] = count

    this.socket.write(buf.subarray(0, 4 + count * 29))
  }

  sendReset(): void {
    if (!this._connected || !this.socket) return
    const buf = Buffer.alloc(4)
    MAGIC.copy(buf, 0)
    buf[2] = MSG_RESET_ALL
    buf[3] = 0
    this.socket.write(buf)
  }

  sendOrigin(position: [number, number, number], quaternion: [number, number, number, number]): void {
    if (!this._connected || !this.socket) return
    const buf = this._originBuf
    MAGIC.copy(buf, 0)
    buf[2] = MSG_SET_ORIGIN
    buf[3] = 0
    let offset = 4
    buf.writeFloatLE(position[0], offset); offset += 4
    buf.writeFloatLE(position[1], offset); offset += 4
    buf.writeFloatLE(position[2], offset); offset += 4
    buf.writeFloatLE(quaternion[0], offset); offset += 4
    buf.writeFloatLE(quaternion[1], offset); offset += 4
    buf.writeFloatLE(quaternion[2], offset); offset += 4
    buf.writeFloatLE(quaternion[3], offset); offset += 4
    this.socket.write(buf)
  }

  /** Update origin without invalidating poses (for per-frame dynamic updates). */
  sendDynamicOrigin(position: [number, number, number], quaternion: [number, number, number, number]): void {
    if (!this._connected || !this.socket) return
    const buf = this._originBuf
    MAGIC.copy(buf, 0)
    buf[2] = MSG_UPDATE_ORIGIN
    buf[3] = 0
    let offset = 4
    buf.writeFloatLE(position[0], offset); offset += 4
    buf.writeFloatLE(position[1], offset); offset += 4
    buf.writeFloatLE(position[2], offset); offset += 4
    buf.writeFloatLE(quaternion[0], offset); offset += 4
    buf.writeFloatLE(quaternion[1], offset); offset += 4
    buf.writeFloatLE(quaternion[2], offset); offset += 4
    buf.writeFloatLE(quaternion[3], offset); offset += 4
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
