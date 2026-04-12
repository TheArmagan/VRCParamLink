import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { TrackingBatchPayload, TrackerEntry } from '../../../../shared/src/index.ts'

type TrackerBridgeOptions = {
  onBatch: (batch: TrackingBatchPayload) => void
  onError?: (error: string) => void
  onExit?: (code: number | null) => void
}

export class TrackerBridge {
  private process: ChildProcess | null = null
  private readonly options: TrackerBridgeOptions

  constructor(options: TrackerBridgeOptions) {
    this.options = options
  }

  spawn(): boolean {
    if (this.process) {
      return true
    }

    const exePath = this.getBinaryPath()
    try {
      this.process = spawn(exePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
    } catch {
      this.options.onError?.(`Failed to spawn tracker bridge: ${exePath}`)
      return false
    }

    if (!this.process.stdout || !this.process.stdin) {
      this.options.onError?.('Tracker bridge process has no stdio')
      this.process = null
      return false
    }

    const rl = createInterface({ input: this.process.stdout })
    rl.on('line', (line) => {
      try {
        const batch = JSON.parse(line) as TrackingBatchPayload
        if (batch && typeof batch.ts === 'number' && Array.isArray(batch.trackers)) {
          this.options.onBatch(batch)
        }
      } catch {
        // Ignore malformed JSON lines
      }
    })

    if (this.process.stderr) {
      const stderrRl = createInterface({ input: this.process.stderr })
      stderrRl.on('line', (line) => {
        console.log('[tracker-bridge]', line)
      })
    }

    this.process.on('exit', (code) => {
      this.process = null
      this.options.onExit?.(code)
    })

    this.process.on('error', (err) => {
      this.options.onError?.(err.message)
      this.process = null
    })

    return true
  }

  startTracking(): void {
    this.sendCommand({ cmd: 'start' })
  }

  stopTracking(): void {
    this.sendCommand({ cmd: 'stop' })
  }

  destroy(): void {
    this.sendCommand({ cmd: 'exit' })
    setTimeout(() => {
      if (this.process) {
        this.process.kill()
        this.process = null
      }
    }, 2000)
  }

  get isRunning(): boolean {
    return this.process !== null
  }

  private sendCommand(cmd: Record<string, string>): void {
    if (!this.process?.stdin?.writable) {
      return
    }

    this.process.stdin.write(JSON.stringify(cmd) + '\n')
  }

  private getBinaryPath(): string {
    if (is.dev) {
      return join(app.getAppPath(), '../../native-windows/target/release/vrcpl-tracker-bridge.exe')
    }
    return join(process.resourcesPath, 'vrcpl-tracker-bridge.exe')
  }
}
