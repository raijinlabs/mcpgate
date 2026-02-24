/**
 * Structured logging via pino for Lucid platform services.
 * Replaces console.log with structured JSON logs.
 */
import pino from 'pino'

export type Logger = pino.Logger

export function createLogger(options: {
  service: string
  level?: string
  pretty?: boolean
}): Logger {
  const level = options.level || process.env.LOG_LEVEL || 'info'
  const pretty = options.pretty ?? (process.env.NODE_ENV !== 'production')

  return pino({
    name: options.service,
    level,
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    base: {
      service: options.service,
      env: process.env.LUCID_ENV || process.env.NODE_ENV || 'development',
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  })
}
