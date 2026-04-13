import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { TrackingBatchPayload } from '../../../../shared/src/index.ts'

type HmdPose = {
  position: [number, number, number]
  rotation: [number, number, number]
}

type TrackerBridgeOptions = {
  onBatch: (batch: TrackingBatchPayload) => void
  onError?: (error: string) => void
  onExit?: (code: number | null) => void
}

export class TrackerBridge {
  private process: ChildProcess | null = null
  private readonly options: TrackerBridgeOptions
  private hmdPoseResolve: ((pose: HmdPose | null) => void) | null = null

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
        const parsed = JSON.parse(line)
        if (parsed && parsed.type === 'hmd_pose' && this.hmdPoseResolve) {
          this.hmdPoseResolve({ position: parsed.position, rotation: parsed.rotation })
          this.hmdPoseResolve = null
          return
        }
        const batch = parsed as TrackingBatchPayload
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
      if (this.hmdPoseResolve) {
        this.hmdPoseResolve(null)
        this.hmdPoseResolve = null
      }
      this.process = null
      this.options.onExit?.(code)
    })

    this.process.on('error', (err) => {
      this.options.onError?.(err.message)
      if (this.hmdPoseResolve) {
        this.hmdPoseResolve(null)
        this.hmdPoseResolve = null
      }
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

  getHmdPose(): Promise<HmdPose | null> {
    if (!this.process) return Promise.resolve(null)
    return new Promise((resolve) => {
      this.hmdPoseResolve = resolve
      this.sendCommand({ cmd: 'get_hmd_pose' })
      // Timeout after 2 seconds
      setTimeout(() => {
        if (this.hmdPoseResolve === resolve) {
          this.hmdPoseResolve = null
          resolve(null)
        }
      }, 2000)
    })
  }

  private sendCommand(cmd: Record<string, string>): void {
    if (!this.process?.stdin?.writable) {
      return
    }

    this.process.stdin.write(JSON.stringify(cmd) + '\n')
  }

  private getBinaryPath(): string {
    if (is.dev) {
      return join(app.getAppPath(), '../native-windows/target/release/vrcpl-tracker-bridge.exe')
    }
    return join(process.resourcesPath, 'vrcpl-tracker-bridge.exe')
  }
}
