export type Tenant = {
  id: string
  name: string
  plan: 'free' | 'pro' | 'growth'
  products?: ('trustgate' | 'mcpgate')[]  // which products tenant has access to (undefined = all)
  email?: string
  stripe_customer_id?: string
  subscription_status?: 'active' | 'past_due' | 'canceled' | 'trialing' | null
}

export type ApiKeyRecord = {
  id: string
  tenantId: string
  keyHash: string
  createdAt: string
  disabled?: boolean
  scopes?: string[] | null  // null = allow-all, string[] = specific scopes
}

export type UsageRecord = {
  tenantId: string
  endpoint: string
  quantity: number
  dimension: 'tokens' | 'calls' | 'duration_ms'
  costUsd: number
  timestamp: string
}
