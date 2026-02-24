import { upsertTenant } from '../auth/tenant-service'
import { registerApiKey } from '../auth/api-key-service'
import { setQuotaLimit } from '../quotas/quota-service'

export function seedTenantsFromEnv(envKey: string) {
  const raw = process.env[envKey]
  if (!raw) return 0
  try {
    const seeds = JSON.parse(raw) as Array<{
      tenantId: string; name?: string; plan?: string; rawKey: string; quotaLimit?: number
    }>
    for (const s of seeds) {
      upsertTenant({ id: s.tenantId, name: s.name || s.tenantId, plan: (s.plan as 'free' | 'pro' | 'growth') || 'pro' })
      setQuotaLimit(s.tenantId, s.quotaLimit || 100000)
      registerApiKey({ id: `key_${s.tenantId}`, tenantId: s.tenantId, rawKey: s.rawKey, createdAt: new Date().toISOString() })
    }
    console.log(`[auth] Seeded ${seeds.length} production tenant(s)`)
    return seeds.length
  } catch (e) {
    console.error(`[auth] Failed to parse ${envKey}:`, e)
    return 0
  }
}
