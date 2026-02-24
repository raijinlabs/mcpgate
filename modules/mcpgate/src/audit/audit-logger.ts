import { createHash } from 'node:crypto'
import type { DbClient } from '@lucid/gateway-core'

export interface AuditEntry {
  tenantId: string
  apiKeyId: string
  serverId: string
  toolName: string
  args?: Record<string, unknown>
  status: 'success' | 'error' | 'denied'
  errorMessage?: string
  durationMs?: number
}

function hashArgs(args: Record<string, unknown> | undefined): string | null {
  if (!args || Object.keys(args).length === 0) return null
  const canonical = JSON.stringify(args, Object.keys(args).sort())
  return createHash('sha256').update(canonical).digest('hex')
}

export function logAuditEvent(db: DbClient, entry: AuditEntry): void {
  db.query(
    `INSERT INTO mcpgate_audit_log
      (tenant_id, api_key_id, server_id, tool_name, args_hash, status, error_message, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.tenantId,
      entry.apiKeyId,
      entry.serverId,
      entry.toolName,
      hashArgs(entry.args),
      entry.status,
      entry.errorMessage ?? null,
      entry.durationMs ?? null,
    ]
  ).catch((err) => {
    console.error('[audit] Failed to log audit event:', err instanceof Error ? err.message : err)
  })
}
