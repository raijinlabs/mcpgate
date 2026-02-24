import { getTenantAsync } from '../auth/tenant-service'
import { getPlanLimits } from './plan-config'

export function enforcePolicy(_tenantId: string, _endpoint: string): boolean {
  return true
}

export async function enforcePolicyAsync(tenantId: string, _endpoint: string, opts?: { feature?: string }): Promise<void> {
  const tenant = await getTenantAsync(tenantId)
  if (!tenant) throw Object.assign(new Error('Unknown tenant'), { statusCode: 404 })

  const limits = getPlanLimits(tenant.plan)

  // Feature gate check
  if (opts?.feature && !limits.features.has(opts.feature)) {
    throw Object.assign(
      new Error(`Feature "${opts.feature}" requires plan upgrade (current: ${tenant.plan})`),
      { statusCode: 403 }
    )
  }
}

/**
 * Check if a tool call is allowed by the API key's scopes.
 * Scope format: "server:tool" with wildcard support.
 * null/undefined scopes = allow all (backwards compatible).
 */
export function enforceToolPolicy(
  scopes: string[] | null | undefined,
  serverId: string,
  toolName: string,
): boolean {
  if (scopes == null) return true
  if (scopes.length === 0) return false
  for (const scope of scopes) {
    const [s, t] = scope.split(':')
    if ((s === '*' || s === serverId) && (!t || t === '*' || t === toolName)) return true
  }
  return false
}
