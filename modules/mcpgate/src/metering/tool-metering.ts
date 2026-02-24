import type { DbClient, ToolCallEvent } from '@lucid/metering'
import { insertLedgerEvent } from '@lucid/metering'

const OPENMETER_ENABLED = process.env.OPENMETER_ENABLED === 'true'
const LUCID_ENV = process.env.LUCID_ENV || 'development'

export function trackToolCall(
  db: DbClient,
  opts: {
    tenantId: string
    toolName: string
    mcpServer: string
    durationMs: number
    statusBucket?: 'success' | 'error' | 'timeout'
    traceId?: string
  },
): void {
  if (!OPENMETER_ENABLED) return

  const event: ToolCallEvent = {
    kind: 'tool',
    orgId: opts.tenantId,
    toolName: opts.toolName,
    mcpServer: opts.mcpServer,
    durationMs: opts.durationMs,
    statusBucket: opts.statusBucket ?? 'success',
    service: 'mcpgate',
    feature: 'tool_call',
    environment: LUCID_ENV,
    traceId: opts.traceId,
  }

  insertLedgerEvent(db, event).catch((err) => {
    console.error('[metering] Failed to insert tool call event:', err instanceof Error ? err.message : err)
  })
}
