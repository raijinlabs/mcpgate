import { createHash } from 'crypto'

let _salt = ''

export function configureHashSalt(salt?: string, env?: string): void {
  if (salt) {
    _salt = salt
    return
  }
  if (env === 'production') {
    console.warn('[observability] OTEL_HASH_SALT not set in production - using fallback salt')
  }
  _salt = 'lucid-dev-salt-not-for-production'
}

export function hashForTelemetry(value: string): string {
  return createHash('sha256').update(`${_salt}:${value}`).digest('hex').slice(0, 32)
}
