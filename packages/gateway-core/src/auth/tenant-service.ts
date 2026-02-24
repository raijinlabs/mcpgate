import type { Tenant } from '../types'

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
let dbQuery: QueryFn | null = null

export function initTenantDb(query: QueryFn): void {
  dbQuery = query
}

const tenants = new Map<string, Tenant>()

export function upsertTenant(tenant: Tenant): Tenant {
  tenants.set(tenant.id, tenant)
  if (dbQuery) {
    dbQuery(
      'INSERT INTO gateway_tenants (id, name, plan) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, plan = $3, updated_at = now()',
      [tenant.id, tenant.name, tenant.plan]
    ).catch(err => console.error('[tenant] DB write failed:', err))
  }
  return tenant
}

export function getTenant(id: string): Tenant | null {
  return tenants.get(id) ?? null
}

export async function getTenantAsync(id: string): Promise<Tenant | null> {
  if (!dbQuery) return getTenant(id)
  try {
    const result = await dbQuery('SELECT id, name, plan FROM gateway_tenants WHERE id = $1', [id])
    if (result.rows.length === 0) return getTenant(id) // fall back to in-memory
    const row = result.rows[0]
    return { id: row.id as string, name: row.name as string, plan: row.plan as Tenant['plan'] }
  } catch {
    return getTenant(id) // DB unreachable fallback
  }
}

/** Test-only: clear all tenants */
export function _resetTenants(): void { tenants.clear() }
