/**
 * Canonical observability conventions for all Lucid services.
 * Single source of truth - import from here, never hardcode strings.
 */

export const SERVICE_NAMESPACE = 'lucid'

export const SERVICE_NAMES = {
  TRUSTGATE: 'lucid-trustgate',
  MCPGATE: 'lucid-mcpgate',
  CONTROL_PLANE: 'lucid-control-plane',
  LUCID_WEB: 'lucid-web',
  LUCID_WORKER: 'lucid-worker',
  LUCID_L2: 'lucid-l2',
  LUCID_CORE: 'lucid-core',
} as const

export const SPAN_NAMES = {
  // TrustGate spans
  CHAT_COMPLETION: 'trustgate.chat_completion',
  EMBEDDING: 'trustgate.embedding',
  LLM_PROXY: 'trustgate.llm_proxy',
  // MCPGate spans
  TOOL_DISCOVER: 'mcpgate.tool_discover',
  TOOL_EXECUTE: 'mcpgate.tool_execute',
  MCP_SERVER_HEALTH: 'mcpgate.server_health',
  // Control-plane spans
  ADMIN_TENANT_CRUD: 'control_plane.tenant_crud',
  ADMIN_KEY_CRUD: 'control_plane.key_crud',
  ADMIN_PLAN_CHANGE: 'control_plane.plan_change',
  BILLING_CHECKOUT: 'control_plane.billing_checkout',
  BILLING_WEBHOOK: 'control_plane.billing_webhook',
  // Shared spans
  LLM_CALL: 'llm.call',
  DB_QUERY: 'db.query',
  METERING_INSERT: 'metering.insert',
  AUTH_VERIFY: 'auth.verify',
  QUOTA_CHECK: 'quota.check',
  POLICY_CHECK: 'policy.check',
  // Worker/web spans (from LucidMerged conventions)
  INBOUND_PIPELINE: 'inbound.pipeline',
  TOOL_EXECUTE_GENERIC: 'tool.execute',
  ENCRYPT_MESSAGE: 'encrypt.message',
  MEMORY_EXTRACT: 'memory.extract',
  OUTBOUND_DELIVER: 'outbound.deliver',
  L2_PROXY_CALL: 'l2.proxy.call',
  RATE_LIMIT_CHECK: 'rate_limit.check',
  DEDUP_CHECK: 'dedup.check',
} as const

export const ATTR_KEYS = {
  // Identity (HASHED via hashForTelemetry)
  TENANT_KEY_HASH: 'lucid.tenant_key_hash',
  SESSION_KEY_HASH: 'lucid.session_key_hash',
  USER_KEY_HASH: 'lucid.user_key_hash',
  // Identifiers (UUIDs - safe raw)
  RUN_ID: 'lucid.run_id',
  CONVERSATION_ID: 'lucid.conversation_id',
  MESSAGE_ID: 'lucid.message_id',
  TENANT_ID: 'lucid.tenant_id',
  // LLM metrics
  LLM_PROVIDER: 'lucid.llm.provider',
  LLM_MODEL: 'lucid.llm.model',
  LLM_ATTEMPT: 'lucid.llm.attempt',
  LLM_STATUS_CODE: 'lucid.llm.status_code',
  LLM_DURATION_MS: 'lucid.llm.duration_ms',
  LLM_ERROR_TYPE: 'lucid.llm.error_type',
  LLM_PROMPT_TOKENS: 'lucid.llm.prompt_tokens',
  LLM_COMPLETION_TOKENS: 'lucid.llm.completion_tokens',
  LLM_TOTAL_TOKENS: 'lucid.llm.total_tokens',
  // Tool metrics
  TOOL_NAME: 'lucid.tool.name',
  TOOL_CATEGORY: 'lucid.tool.category',
  TOOL_ALLOWED: 'lucid.tool.allowed',
  TOOL_DURATION_MS: 'lucid.tool.duration_ms',
  TOOL_ERROR_TYPE: 'lucid.tool.error_type',
  // Service
  SERVICE: 'lucid.service',
  FEATURE: 'lucid.feature',
  ENVIRONMENT: 'lucid.environment',
  // HTTP
  HTTP_METHOD: 'http.method',
  HTTP_ROUTE: 'http.route',
  HTTP_STATUS_CODE: 'http.status_code',
} as const

export const SAMPLING_DEFAULTS: Record<string, number> = {
  production: 0.1,
  staging: 1.0,
  development: 1.0,
  test: 0.0,
}

export type LucidEnvironment = 'production' | 'staging' | 'development' | 'test'

export function getLucidEnv(): LucidEnvironment {
  const env = process.env.LUCID_ENV || process.env.NODE_ENV || 'development'
  if (env === 'prod') return 'production'
  if (env === 'dev') return 'development'
  if (env === 'stage' || env === 'preview') return 'staging'
  return env as LucidEnvironment
}
