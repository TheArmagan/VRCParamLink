import net from 'net'
import type { TrackerEntry } from '../../../../shared/src/index.ts'

const PIPE_PATH = '\\\\.\\pipe\\vrcpl-tracking'
const MAGIC = Buffer.from([0x56, 0x50])
const MSG_POSE_UPDATE = 0x01
const MSG_RESET_ALL = 0x02

function addressToSlot(address: string): number {
  if (address.includes('/head')) return 0
  const match = address.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : -1
}

export class TrackerPipeClient {
  private socket: net.Socket | null = null
  private _connected = false
  private reconnecting = false

  get isConnected(): boolean {
    return this._connected
  }

  connect(): Promise<boolean> {
    if (this._connected) return Promise.resolve(true)

    return new Promise((resolve) => {
      const socket = net.createConnection(PIPE_PATH)

      const cleanup = (): void => {
        socket.removeAllListeners()
      }

      socket.on('connect', () => {
        cleanup()
        this.socket = socket
        this._connected = true

        socket.on('error', () => {
          this._connected = false
          this.socket = null
        })
        socket.on('close', () => {
          this._connected = false
          this.socket = null
        })

        console.log('[tracker-pipe] Connected to driver')
        resolve(true)
      })

      socket.on('error', () => {
        cleanup()
        resolve(false)
      })
    })
  }

  async connectWithRetry(maxAttempts = 20, intervalMs = 500): Promise<boolean> {
    if (this.reconnecting) return false
    this.reconnecting = true

    for (let i = 0; i < maxAttempts; i++) {
      const ok = await this.connect()
      if (ok) {
        this.reconnecting = false
        return true
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }

    this.reconnecting = false
    console.error('[tracker-pipe] Failed to connect after', maxAttempts, 'attempts')
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

  disconnect(): void {
    if (this.socket) {
      try { this.sendReset() } catch { /* ignore */ }
      this.socket.destroy()
      this.socket = null
      this._connected = false
      console.log('[tracker-pipe] Disconnected')
    }
  }
}
