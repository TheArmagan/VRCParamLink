/**
 * Tracks per-parameter update frequency per room.
 * Used by auto-owner to avoid transferring ownership when a batch
 * contains only rapidly-changing parameters (e.g. tracking data).
 */

/** Time window (ms) over which update counts are measured. */
const RATE_WINDOW_MS = 3_000

/**
 * If a parameter has been updated this many times or more within
 * the window, it is considered "rapidly changing" (e.g. tracking / continuous float).
 */
const RAPID_CHANGE_THRESHOLD = 15

export class ParamRateTracker {
  /** roomCode → paramPath → recent update timestamps */
  private readonly history = new Map<string, Map<string, number[]>>()

  /** Record that the given param paths were updated in a room. */
  recordUpdates(roomCode: string, paramPaths: string[]): void {
    let roomMap = this.history.get(roomCode)
    if (!roomMap) {
      roomMap = new Map()
      this.history.set(roomCode, roomMap)
    }

    const now = Date.now()
    for (const path of paramPaths) {
      let timestamps = roomMap.get(path)
      if (!timestamps) {
        timestamps = []
        roomMap.set(path, timestamps)
      }
      timestamps.push(now)
    }
  }

  /**
   * Returns `true` if at least one of the given param paths is "stable"
   * (has NOT been changing rapidly in the recent window).
   * A batch that contains only rapidly-changing params should NOT trigger auto-owner.
   */
  hasStableParam(roomCode: string, paramPaths: string[]): boolean {
    const roomMap = this.history.get(roomCode)
    if (!roomMap) return true // no history → everything is new/stable

    const now = Date.now()
    const cutoff = now - RATE_WINDOW_MS

    for (const path of paramPaths) {
      const timestamps = roomMap.get(path)
      if (!timestamps) return true // never seen → new param → stable

      // Prune old entries in-place
      const firstValidIdx = timestamps.findIndex(t => t >= cutoff)
      if (firstValidIdx > 0) {
        timestamps.splice(0, firstValidIdx)
      } else if (firstValidIdx === -1) {
        // all entries are old
        roomMap.delete(path)
        return true
      }

      if (timestamps.length < RAPID_CHANGE_THRESHOLD) {
        return true // this param is stable
      }
    }

    return false // every param in the batch is rapidly changing
  }

  /**
   * Returns `true` if the given param is rapidly changing (above threshold).
   * Used by adaptive throttling to decide per-param broadcast strategy.
   */
  isRapidParam(roomCode: string, paramPath: string): boolean {
    const roomMap = this.history.get(roomCode)
    if (!roomMap) return false

    const timestamps = roomMap.get(paramPath)
    if (!timestamps) return false

    const now = Date.now()
    const cutoff = now - RATE_WINDOW_MS

    // Prune old entries in-place
    const firstValidIdx = timestamps.findIndex(t => t >= cutoff)
    if (firstValidIdx > 0) {
      timestamps.splice(0, firstValidIdx)
    } else if (firstValidIdx === -1) {
      roomMap.delete(paramPath)
      return false
    }

    return timestamps.length >= RAPID_CHANGE_THRESHOLD
  }

  /** Remove all tracking data for a room (call on room deletion). */
  pruneRoom(roomCode: string): void {
    this.history.delete(roomCode)
  }
}
