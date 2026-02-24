/**
 * Error sanitization for telemetry - strips response bodies and classifies errors safely.
 */

const DANGEROUS_PROPS = ['response', 'data', 'body', 'cause', 'config'] as const

export function sanitizeErrorForTelemetry(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err))

  for (const prop of DANGEROUS_PROPS) {
    if (prop in err) {
      try {
        delete (err as unknown as Record<string, unknown>)[prop]
      } catch {
        const safe = new Error(err.message)
        safe.name = err.name
        safe.stack = err.stack
        return safe
      }
    }
  }
  return err
}

export function classifyError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown_error'
  const msg = err.message.toLowerCase()
  const status = msg.match(/\b(\d{3})\b/)?.[1]
  if (status) return `status_${status}`
  if (msg.includes('timeout') || msg.includes('aborterror') || msg.includes('abort')) return 'timeout'
  if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('fetch failed')) return 'network_error'
  if (msg.includes('rate') && msg.includes('limit')) return 'rate_limited'
  if (msg.includes('unauthorized') || msg.includes('401')) return 'auth_error'
  if (msg.includes('quota')) return 'quota_exceeded'
  return 'provider_error'
}
