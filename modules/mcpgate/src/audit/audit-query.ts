import type { DbClient } from '@lucid/gateway-core'

export interface AuditLogFilters {
  tenantId: string
  serverId?: string
  toolName?: string
  apiKeyId?: string
  status?: 'success' | 'error' | 'denied'
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export interface AuditLogEntry {
  id: number
  tenant_id: string
  api_key_id: string
  server_id: string
  tool_name: string
  args_hash: string | null
  status: string
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

export async function queryAuditLogs(
  db: DbClient,
  filters: AuditLogFilters,
): Promise<{ items: AuditLogEntry[]; total: number; page: number; per_page: number }> {
  const conditions: string[] = ['tenant_id = $1']
  const values: unknown[] = [filters.tenantId]
  let idx = 2

  if (filters.serverId) { conditions.push(`server_id = $${idx++}`); values.push(filters.serverId) }
  if (filters.toolName) { conditions.push(`tool_name = $${idx++}`); values.push(filters.toolName) }
  if (filters.apiKeyId) { conditions.push(`api_key_id = $${idx++}`); values.push(filters.apiKeyId) }
  if (filters.status) { conditions.push(`status = $${idx++}`); values.push(filters.status) }
  if (filters.from) { conditions.push(`created_at >= $${idx++}`); values.push(filters.from) }
  if (filters.to) { conditions.push(`created_at <= $${idx++}`); values.push(filters.to) }

  const where = `WHERE ${conditions.join(' AND ')}`
  const page = Math.max(1, filters.page ?? 1)
  const perPage = Math.min(100, Math.max(1, filters.perPage ?? 50))
  const offset = (page - 1) * perPage

  const countResult = await db.query(`SELECT COUNT(*) as total FROM mcpgate_audit_log ${where}`, values)
  const total = parseInt(String((countResult.rows[0] as Record<string, unknown>).total), 10)

  const dataResult = await db.query(
    `SELECT * FROM mcpgate_audit_log ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, perPage, offset]
  )

  return { items: dataResult.rows as AuditLogEntry[], total, page, per_page: perPage }
}
