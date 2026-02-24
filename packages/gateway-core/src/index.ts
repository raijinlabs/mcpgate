// Types
export type { Tenant, ApiKeyRecord, UsageRecord } from './types'

// Auth
export { hashApiKey, registerApiKey, verifyApiKey, verifyApiKeyAsync, initApiKeyDb } from './auth/api-key-service'
export { upsertTenant, getTenant, getTenantAsync, initTenantDb } from './auth/tenant-service'

// Quotas
export { setQuotaLimit, assertWithinQuota, assertWithinQuotaAsync, initQuotaDb } from './quotas/quota-service'

// Usage
export { recordUsage, listUsageForTenant } from './usage/usage-service'

// Policy
export { enforcePolicy, enforceToolPolicy, enforcePolicyAsync } from './policy/policy-service'
export { getPlanLimits, PLAN_LIMITS } from './policy/plan-config'
export type { PlanLimits } from './policy/plan-config'

// Feature flags
export { FEATURE_FLAGS } from './feature-flags'

// Events
export { createEventEmitter } from './events/event-emitter'
export type { QueryFn } from './events/event-emitter'

// DB
export { createDbClient } from './db/client'
export type { DbClient } from './db/client'

// Fastify helpers
export { resolveTenantId, resolveTenantIdAsync, resolveApiKeyAsync } from './fastify/auth-hook'
export { registerHealthRoute } from './fastify/health-route'
export { seedTenantsFromEnv } from './fastify/seed-tenants'

// Test-only resets (prefixed with _ to indicate internal use)
export { _resetKeys } from './auth/api-key-service'
export { _resetTenants } from './auth/tenant-service'
export { _resetQuotas } from './quotas/quota-service'
