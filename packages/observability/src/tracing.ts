/**
 * OpenTelemetry tracing for Lucid platform core services.
 * Provides distributed tracing with OTLP export.
 */
import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api'
import type { Tracer, Span } from '@opentelemetry/api'
import { SERVICE_NAMES, SERVICE_NAMESPACE, SAMPLING_DEFAULTS, getLucidEnv } from './conventions'
import { configureHashSalt } from './hash'

type AttrValue = string | number | boolean

let _sdk: { shutdown: () => Promise<void> } | null = null

export async function initTracing(options?: {
  serviceName?: string
  endpoint?: string
}): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') {
    console.log('[otel] Tracing disabled (OTEL_ENABLED !== true)')
    return
  }

  try {
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { resourceFromAttributes },
      semantic,
      { BatchSpanProcessor },
    ] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/semantic-conventions'),
      import('@opentelemetry/sdk-trace-base'),
    ])

    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = semantic
    const environment = getLucidEnv()
    const serviceName = options?.serviceName || process.env.OTEL_SERVICE_NAME || SERVICE_NAMES.TRUSTGATE
    const endpoint = options?.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

    configureHashSalt(process.env.OTEL_HASH_SALT, environment)

    const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      'deployment.environment.name': environment,
      'service.namespace': SERVICE_NAMESPACE,
    })

    const sdk = new NodeSDK({
      resource,
      spanProcessors: [new BatchSpanProcessor(exporter)],
    })

    sdk.start()
    _sdk = sdk

    process.on('SIGTERM', () => {
      _sdk?.shutdown().catch(() => undefined)
    })

    console.log(`[otel] Tracing initialized for ${serviceName} (env=${environment}, endpoint=${endpoint})`)
  } catch (err) {
    console.warn(`[otel] Failed to init tracing: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function getTracer(name?: string): Tracer {
  return trace.getTracer(name || SERVICE_NAMES.TRUSTGATE)
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, AttrValue>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = getTracer().startSpan(name, { attributes: attrs })
  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span))
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'unknown' })
    span.recordException(err instanceof Error ? err : new Error(String(err)))
    throw err
  } finally {
    span.end()
  }
}

export async function shutdownTracing(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown()
    _sdk = null
  }
}

export { SpanStatusCode }
export type { Span }
