export type PlanLimits = {
  maxRequestsPerDay: number
  maxToolCallsPerDay: number    // MCPGate
  maxModelsAllowed: number       // TrustGate
  maxApiKeys: number
  maxAgents: number              // MCPGate
  rateLimitPerMinute: number
  features: Set<string>          // e.g. 'chains', 'plugins', 'streaming'
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { maxRequestsPerDay: 1000, maxToolCallsPerDay: 500, maxModelsAllowed: 3, maxApiKeys: 2, maxAgents: 1, rateLimitPerMinute: 60, features: new Set() },
  pro:  { maxRequestsPerDay: 50_000, maxToolCallsPerDay: 25_000, maxModelsAllowed: 20, maxApiKeys: 10, maxAgents: 10, rateLimitPerMinute: 600, features: new Set(['chains', 'plugins', 'streaming']) },
  growth: { maxRequestsPerDay: 500_000, maxToolCallsPerDay: 250_000, maxModelsAllowed: -1, maxApiKeys: 50, maxAgents: 100, rateLimitPerMinute: 3000, features: new Set(['chains', 'plugins', 'streaming', 'custom_servers', 'priority_support']) },
}

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}
