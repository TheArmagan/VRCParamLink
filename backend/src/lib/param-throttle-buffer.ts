import type { ParamValue, OutboundParamBatchPayload } from '../../../shared/src/index.ts'

export interface ThrottledFlushEntry {
  roomCode: string
  sourceSessionId: string
  params: ParamValue[]
}

/**
 * Buffers rapidly-changing parameters per room+session.
 * Only the latest value per param path is kept.
 * Periodically flushed to produce throttled broadcast batches.
 */
export class ParamThrottleBuffer {
  /** roomCode → sessionId → paramPath → ParamValue */
  private readonly buffer = new Map<string, Map<string, Map<string, ParamValue>>>()

  /** Add params to the buffer, keeping only the latest value per path. */
  add(roomCode: string, sessionId: string, params: ParamValue[]): void {
    let roomMap = this.buffer.get(roomCode)
    if (!roomMap) {
      roomMap = new Map()
      this.buffer.set(roomCode, roomMap)
    }

    let sessionMap = roomMap.get(sessionId)
    if (!sessionMap) {
      sessionMap = new Map()
      roomMap.set(sessionId, sessionMap)
    }

    for (const param of params) {
      sessionMap.set(param.path, param)
    }
  }

  /** Drain all buffered entries and return them grouped by room+session. */
  flush(): ThrottledFlushEntry[] {
    const entries: ThrottledFlushEntry[] = []

    for (const [roomCode, roomMap] of this.buffer) {
      for (const [sessionId, sessionMap] of roomMap) {
        if (sessionMap.size === 0) continue

        entries.push({
          roomCode,
          sourceSessionId: sessionId,
          params: Array.from(sessionMap.values())
        })
      }
    }

    this.buffer.clear()
    return entries
  }

  /** Remove all buffered data for a room. */
  pruneRoom(roomCode: string): void {
    this.buffer.delete(roomCode)
  }
}
