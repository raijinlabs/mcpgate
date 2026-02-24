export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>

/**
 * Generic fire-and-forget event emitter.
 * Never throws. Logs errors and continues.
 */
export function createEventEmitter(queryFn: QueryFn | null) {
  return async function emit(sql: string, params: unknown[]): Promise<void> {
    if (!queryFn) return
    try {
      await queryFn(sql, params)
    } catch (err) {
      console.error('[event-emitter] Failed to emit event:', err)
    }
  }
}
