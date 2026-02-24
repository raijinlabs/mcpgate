type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
let dbQuery: QueryFn | null = null

export function initQuotaDb(query: QueryFn): void {
  dbQuery = query
}

function todayPeriod(): string {
  return new Date().toISOString().slice(0, 10)
}

const requestCountByTenant = new Map<string, number>()
const quotaLimitByTenant = new Map<string, number>()

export function setQuotaLimit(tenantId: string, maxRequests: number) {
  quotaLimitByTenant.set(tenantId, maxRequests)
}

export function assertWithinQuota(tenantId: string) {
  const current = requestCountByTenant.get(tenantId) ?? 0
  const limit = quotaLimitByTenant.get(tenantId) ?? 1000
  if (current >= limit) throw new Error('Quota exceeded')
  requestCountByTenant.set(tenantId, current + 1)
}

export async function assertWithinQuotaAsync(tenantId: string, service = 'default'): Promise<void> {
  if (!dbQuery) {
    assertWithinQuota(tenantId)
    return
  }
  try {
    const period = todayPeriod()
    const result = await dbQuery(
      `INSERT INTO gateway_quota_usage (tenant_id, service, period, request_count, quota_limit)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (tenant_id, service, period)
       DO UPDATE SET request_count = gateway_quota_usage.request_count + 1
       RETURNING request_count, quota_limit`,
      [tenantId, service, period, quotaLimitByTenant.get(tenantId) ?? 1000]
    )
    const row = result.rows[0]
    if (row && (row.request_count as number) > (row.quota_limit as number)) {
      throw new Error('Quota exceeded')
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Quota exceeded') throw err
    // DB unreachable — fall back to in-memory
    assertWithinQuota(tenantId)
  }
}

/** Test-only: clear all quotas */
export function _resetQuotas(): void {
  requestCountByTenant.clear()
  quotaLimitByTenant.clear()
}
