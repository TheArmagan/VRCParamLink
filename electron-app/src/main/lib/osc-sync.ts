import {
  DEFAULT_OSC_HOST,
  DEFAULT_OSC_INBOUND_PORT,
  DEFAULT_OSC_OUTBOUND_PORT,
  isSupportedOscPath,
  OSC_ECHO_SUPPRESSION_MS,
  PARAM_BATCH_INTERVAL_MS,
  type OutboundParamBatchPayload,
  type ParamValue
} from '../../../../shared/src/index.ts'
import { OSC, type OSCArg, type OSCMessage } from './OSC.ts'

type OscSyncOptions = {
  onLocalParamBatch: (params: ParamValue[], batchSeq: number) => Promise<void> | void
  onError?: (error: Error) => void
}

type SuppressedParamRecord = {
  valueType: ParamValue['valueType']
  value: ParamValue['value']
  expiresAt: number
}

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
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private batchSequence = 0
  private started = false

  constructor(private readonly options: OscSyncOptions) {}

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
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    this.pendingParams.clear()
    this.suppressedParams.clear()
    this.osc.removeAllListeners()
    this.osc.close()
    this.started = false
  }

  applySnapshot(params: ParamValue[]): void {
    for (const param of params) {
      this.sendParamToOsc(param)
    }
  }

  applyRemoteBatch(payload: OutboundParamBatchPayload): void {
    for (const param of payload.params) {
      this.sendParamToOsc(param)
    }
  }

  private handleOscMessage(message: OSCMessage): void {
    if (!isSupportedOscPath(message.address)) {
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

    const params = [...this.pendingParams.values()]
    this.pendingParams.clear()

    try {
      await this.options.onLocalParamBatch(params, this.batchSequence++)
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error('OSC param batch flush failed.'))
    }
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