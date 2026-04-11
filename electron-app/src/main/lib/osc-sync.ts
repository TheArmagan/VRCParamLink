import {
  AVATAR_CHANGE_OSC_ADDRESS,
  DEFAULT_OSC_HOST,
  DEFAULT_OSC_INBOUND_PORT,
  DEFAULT_OSC_OUTBOUND_PORT,
  isBuiltinVrcParam,
  isSupportedOscPath,
  OSC_ECHO_SUPPRESSION_MS,
  PARAM_BATCH_INTERVAL_MS,
  RAPID_PARAM_THROTTLE_MS,
  type OutboundParamBatchPayload,
  type ParamValue
} from '../../../../shared/src/index.ts'
import { shouldApplyRemoteParam } from './app-state.ts'
import { OSC, type OSCArg, type OSCMessage } from './OSC.ts'

type OscSyncOptions = {
  onLocalParamBatch: (params: ParamValue[], batchSeq: number) => Promise<void> | void
  onAvatarChange?: (avatarId: string) => void
  onError?: (error: Error) => void
}

type SuppressedParamRecord = {
  valueType: ParamValue['valueType']
  value: ParamValue['value']
  expiresAt: number
}

/** Time window (ms) for measuring param update frequency. */
const RATE_WINDOW_MS = 3_000
/** Updates within the window to classify a param as rapidly changing. */
const RAPID_CHANGE_THRESHOLD = 8

export class OscSyncService {
  private readonly osc = new OSC({
    local: {
      address: DEFAULT_OSC_HOST,
      port: DEFAULT_OSC_INBOUND_PORT
    },
    remote: {
      address: DEFAULT_OSC_HOST,
      port: DEFAULT_OSC_OUTBOUND_PORT
    }
  })

  private readonly pendingParams = new Map<string, ParamValue>()
  private readonly suppressedParams = new Map<string, SuppressedParamRecord>()
  /** paramPath → recent update timestamps for rate classification. */
  private readonly paramUpdateHistory = new Map<string, number[]>()
  /** Buffered rapid params awaiting throttled flush. Only latest value per path kept. */
  private readonly rapidParamBuffer = new Map<string, ParamValue>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private rapidFlushTimer: ReturnType<typeof setInterval> | null = null
  private batchSequence = 0
  private started = false

  constructor(private readonly options: OscSyncOptions) { }

  start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.osc.on('message', (message: OSCMessage) => {
      this.handleOscMessage(message)
    })
    this.osc.on('error', (error: Error) => {
      this.options.onError?.(error)
    })
    this.osc.open()

    this.flushTimer = setInterval(() => {
      void this.flushPendingParams()
    }, PARAM_BATCH_INTERVAL_MS)

    this.rapidFlushTimer = setInterval(() => {
      void this.flushRapidParams()
    }, RAPID_PARAM_THROTTLE_MS)
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    if (this.rapidFlushTimer) {
      clearInterval(this.rapidFlushTimer)
      this.rapidFlushTimer = null
    }

    this.pendingParams.clear()
    this.suppressedParams.clear()
    this.paramUpdateHistory.clear()
    this.rapidParamBuffer.clear()
    this.osc.removeAllListeners()
    this.osc.close()
    this.started = false
  }

  applySnapshot(params: ParamValue[]): void {
    for (const param of params) {
      if (shouldApplyRemoteParam(param.path)) {
        this.sendParamToOsc(param)
      }
    }
  }

  applyRemoteBatch(payload: OutboundParamBatchPayload): void {
    for (const param of payload.params) {
      if (shouldApplyRemoteParam(param.path)) {
        this.sendParamToOsc(param)
      }
    }
  }

  sendSingleParam(param: ParamValue): void {
    this.sendParamToOsc(param)
  }

  private handleOscMessage(message: OSCMessage): void {
    // Handle avatar change separately
    if (message.address === AVATAR_CHANGE_OSC_ADDRESS) {
      const avatarArg = message.args[0]
      if (avatarArg && avatarArg.type === 's' && typeof avatarArg.value === 'string') {
        this.options.onAvatarChange?.(avatarArg.value)
      }
      return
    }

    if (!isSupportedOscPath(message.address) || isBuiltinVrcParam(message.address)) {
      return
    }

    const nextParam = this.mapOscMessageToParam(message)
    if (!nextParam || this.shouldSuppressLocalEcho(nextParam)) {
      return
    }

    this.pendingParams.set(nextParam.path, nextParam)
  }

  private async flushPendingParams(): Promise<void> {
    if (this.pendingParams.size === 0) {
      return
    }

    const allParams = [...this.pendingParams.values()]
    this.pendingParams.clear()

    // Record update timestamps for rate classification
    const now = Date.now()
    for (const param of allParams) {
      this.recordParamUpdate(param.path, now)
    }

    // Split into stable (immediate) and rapid (buffered)
    const stableParams: ParamValue[] = []
    for (const param of allParams) {
      if (this.isRapidParam(param.path, now)) {
        this.rapidParamBuffer.set(param.path, param)
      } else {
        stableParams.push(param)
      }
    }

    if (stableParams.length === 0) {
      return
    }

    try {
      await this.options.onLocalParamBatch(stableParams, this.batchSequence++)
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error('OSC param batch flush failed.'))
    }
  }

  private async flushRapidParams(): Promise<void> {
    if (this.rapidParamBuffer.size === 0) {
      return
    }

    const params = [...this.rapidParamBuffer.values()]
    this.rapidParamBuffer.clear()

    try {
      await this.options.onLocalParamBatch(params, this.batchSequence++)
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error('OSC rapid param flush failed.'))
    }
  }

  private recordParamUpdate(path: string, now: number): void {
    let timestamps = this.paramUpdateHistory.get(path)
    if (!timestamps) {
      timestamps = []
      this.paramUpdateHistory.set(path, timestamps)
    }
    timestamps.push(now)
  }

  private isRapidParam(path: string, now: number): boolean {
    const timestamps = this.paramUpdateHistory.get(path)
    if (!timestamps) return false

    const cutoff = now - RATE_WINDOW_MS

    // Prune old entries
    const firstValidIdx = timestamps.findIndex(t => t >= cutoff)
    if (firstValidIdx > 0) {
      timestamps.splice(0, firstValidIdx)
    } else if (firstValidIdx === -1) {
      this.paramUpdateHistory.delete(path)
      return false
    }

    return timestamps.length >= RAPID_CHANGE_THRESHOLD
  }

  private mapOscMessageToParam(message: OSCMessage): ParamValue | null {
    const primaryArg = message.args[0]
    if (!primaryArg) {
      return null
    }

    if (primaryArg.type === 'T' || primaryArg.type === 'F') {
      return {
        path: message.address,
        valueType: 'bool',
        value: primaryArg.type === 'T'
      }
    }

    if (primaryArg.type === 'i' && typeof primaryArg.value === 'number') {
      return {
        path: message.address,
        valueType: 'int',
        value: primaryArg.value
      }
    }

    if (primaryArg.type === 'f' && typeof primaryArg.value === 'number') {
      return {
        path: message.address,
        valueType: 'float',
        value: primaryArg.value
      }
    }

    return null
  }

  private sendParamToOsc(param: ParamValue): void {
    this.rememberSuppressedParam(param)
    this.osc.send({
      address: param.path,
      args: [this.toOscArg(param)]
    })
  }

  private toOscArg(param: ParamValue): OSCArg {
    if (param.valueType === 'bool') {
      return {
        type: param.value ? 'T' : 'F',
        value: param.value
      }
    }

    if (param.valueType === 'int') {
      return {
        type: 'i',
        value: param.value
      }
    }

    return {
      type: 'f',
      value: param.value
    }
  }

  private rememberSuppressedParam(param: ParamValue): void {
    this.suppressedParams.set(param.path, {
      valueType: param.valueType,
      value: param.value,
      expiresAt: Date.now() + OSC_ECHO_SUPPRESSION_MS
    })
  }

  private shouldSuppressLocalEcho(param: ParamValue): boolean {
    const currentEntry = this.suppressedParams.get(param.path)
    if (!currentEntry) {
      return false
    }

    if (currentEntry.expiresAt < Date.now()) {
      this.suppressedParams.delete(param.path)
      return false
    }

    if (currentEntry.valueType !== param.valueType) {
      return false
    }

    if (param.valueType === 'float') {
      return Math.abs(Number(currentEntry.value) - Number(param.value)) < 0.0001
    }

    return currentEntry.value === param.value
  }
}