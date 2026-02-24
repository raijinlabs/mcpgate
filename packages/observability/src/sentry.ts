/**
 * Sentry integration for Lucid platform core services.
 * Provides error tracking, performance monitoring, and structured context.
 */
import * as Sentry from '@sentry/node'
import { getLucidEnv, SAMPLING_DEFAULTS } from './conventions'

let _initialized = false

export interface SentryInitOptions {
  dsn?: string
  serviceName: string
  release?: string
  environment?: string
  tracesSampleRate?: number
}

export function initSentry(options: SentryInitOptions): void {
  if (_initialized) return

  const dsn = options.dsn || process.env.SENTRY_DSN
  if (!dsn) {
    console.warn(`[sentry] No SENTRY_DSN - error tracking disabled for ${options.serviceName}`)
    return
  }

  const environment = options.environment || getLucidEnv()
  const tracesSampleRate = options.tracesSampleRate ?? SAMPLING_DEFAULTS[environment] ?? 0.1

  Sentry.init({
    dsn,
    environment,
    release: options.release || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || 'dev',
    serverName: options.serviceName,
    tracesSampleRate,
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip authorization headers
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
        delete event.request.headers['x-api-key']
      }
      // Redact API keys from breadcrumb data
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.data) {
            for (const key of Object.keys(bc.data)) {
              if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
                bc.data[key] = '[REDACTED]'
              }
            }
          }
        }
      }
      return event
    },
  })

  _initialized = true
  console.log(`[sentry] Initialized for ${options.serviceName} (env=${environment}, sampling=${tracesSampleRate})`)
}

export function captureError(
  error: Error | unknown,
  context?: { tenantId?: string; service?: string; operation?: string; [key: string]: unknown },
): void {
  if (!_initialized) {
    console.error('[sentry-fallback]', error, context)
    return
  }

  Sentry.withScope((scope) => {
    if (context) {
      if (context.tenantId) scope.setTag('tenant_id', context.tenantId)
      if (context.service) scope.setTag('service', context.service)
      if (context.operation) scope.setTag('operation', context.operation)
      scope.setContext('custom', context)
    }
    if (error instanceof Error) {
      Sentry.captureException(error)
    } else {
      Sentry.captureException(new Error(String(error)))
    }
  })
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' | 'fatal' = 'info',
  context?: Record<string, unknown>,
): void {
  if (!_initialized) {
    console.log(`[sentry-fallback:${level}]`, message, context)
    return
  }

  Sentry.withScope((scope) => {
    if (context) scope.setContext('custom', context)
    Sentry.captureMessage(message, level)
  })
}

export function setSentryUser(user: { id: string; [key: string]: string }): void {
  if (!_initialized) return
  Sentry.setUser(user)
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!_initialized) return
  Sentry.addBreadcrumb({ category, message, data, level: 'info', timestamp: Date.now() / 1000 })
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!_initialized) return
  await Sentry.flush(timeoutMs)
}
