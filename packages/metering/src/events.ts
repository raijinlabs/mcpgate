import { randomUUID } from 'crypto'
import type { CloudEvent } from './client'

export type LlmUsageEvent = {
  kind: 'llm'
  orgId: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  providerName: string
  modelFamily: string
  statusBucket: 'success' | 'error' | 'timeout'
  service: string
  feature: string
  environment: string
  traceId?: string
  runId?: string
}

export type ToolCallEvent = {
  kind: 'tool'
  orgId: string
  toolName: string
  mcpServer: string
  durationMs: number
  statusBucket: 'success' | 'error' | 'timeout'
  service: string
  feature: string
  environment: string
  traceId?: string
}

export type UsageEvent = LlmUsageEvent | ToolCallEvent

export function buildCloudEvent(event: UsageEvent): CloudEvent {
  const base = {
    specversion: '1.0' as const,
    id: randomUUID(),
    subject: event.orgId,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
  }

  if (event.kind === 'llm') {
    return {
      ...base,
      source: `lucid/${event.service}`,
      type: 'llm.token.usage',
      data: {
        total_tokens: event.totalTokens,
        prompt_tokens: event.promptTokens,
        completion_tokens: event.completionTokens,
        provider: event.providerName,
        model: event.modelFamily,
        status: event.statusBucket,
        service: event.service,
        feature: event.feature,
        environment: event.environment,
      },
    }
  }

  return {
    ...base,
    source: `lucid/${event.service}`,
    type: 'tool.call.usage',
    data: {
      tool_name: event.toolName,
      mcp_server: event.mcpServer,
      duration_ms: event.durationMs,
      status: event.statusBucket,
      service: event.service,
      feature: event.feature,
      environment: event.environment,
    },
  }
}

export type DbClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
}

export async function insertLedgerEvent(db: DbClient, event: UsageEvent): Promise<string> {
  const eventId = randomUUID()

  if (event.kind === 'llm') {
    await db.query(
      `INSERT INTO openmeter_event_ledger (
        event_id, org_id, event_type, total_tokens, prompt_tokens, completion_tokens,
        provider_name, model_family, status_bucket, service, feature,
        environment, trace_id, run_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        eventId, event.orgId, 'llm.token.usage',
        event.totalTokens, event.promptTokens, event.completionTokens,
        event.providerName, event.modelFamily, event.statusBucket,
        event.service, event.feature, event.environment,
        event.traceId ?? null, event.runId ?? null,
      ]
    )
  } else {
    await db.query(
      `INSERT INTO openmeter_event_ledger (
        event_id, org_id, event_type, quantity, dimension_type,
        provider_name, model_family, status_bucket, service, feature,
        environment, trace_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        eventId, event.orgId, 'tool.call.usage',
        event.durationMs, 'duration_ms',
        event.mcpServer, event.toolName, event.statusBucket,
        event.service, event.feature, event.environment,
        event.traceId ?? null,
      ]
    )
  }

  return eventId
}
