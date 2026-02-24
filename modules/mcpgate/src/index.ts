export { toolCallRequestSchema, serverRegisterSchema, serverListSchema } from './schemas/mcp-request'
export type { ToolCallRequest, ServerRegisterRequest } from './schemas/mcp-request'
export type { ToolCallResponse, ServerInfo } from './schemas/mcp-response'
export { ToolRegistry } from './registry/tool-registry'
export type { RegisterServerInput } from './registry/tool-registry'
// CredentialAdapter system (v2)
export type { CredentialAdapter, TokenResult, ConnectionInfo } from './auth/credential-adapter.js'
export { EnvVarAdapter } from './auth/env-var-adapter.js'
export { DatabaseAdapter } from './auth/database-adapter.js'
export type { QueryFn } from './auth/database-adapter.js'
export { CompositeAdapter } from './auth/composite-adapter.js'

export { routeToolCall, routeToolList, routeToolListFiltered } from './router/tool-router'
export type { ToolCallResult, ToolCallOptions, ToolListFilters } from './router/tool-router'
export { trackToolCall } from './metering/tool-metering'
export { SessionManager } from './mcp-client/session-manager'

// Audit
export { logAuditEvent } from './audit/audit-logger'
export type { AuditEntry } from './audit/audit-logger'
export { queryAuditLogs } from './audit/audit-query'
export type { AuditLogFilters, AuditLogEntry } from './audit/audit-query'

// Session budgets
export { SessionStore } from './session/index.js'
export type { Session, SessionBudget, SessionUsage, SessionStatus, EnforceResult } from './session/index.js'

// Discovery
export { ToolSearchIndex } from './discovery/index.js'
export type { ToolEntry, SearchResult } from './discovery/index.js'

// Chain execution
export { executeChain } from './router/chain-executor.js'
export type { ChainStep, ChainRequest, ChainResult, StepResult, ErrorStrategy, ToolCallFn } from './router/chain-executor.js'

// Rate limiting
export { RateLimiter } from './router/rate-limiter.js'
export type { RateLimitConfig, RateLimitResult } from './router/rate-limiter.js'

// Circuit breaker
export { CircuitBreaker } from './registry/circuit-breaker.js'
export type { CircuitState, CircuitBreakerConfig, CircuitStatus } from './registry/circuit-breaker.js'

// Health probes
export { getHealthStatus, HealthProbe } from './registry/server-health.js'
export type { ProbeFn, HealthProbeConfig } from './registry/server-health.js'

// Builtin servers
export {
  builtinServerCount,
  listBuiltinServerNames,
  listBuiltinTools,
  isBuiltinServer,
  BUILTIN_PREFIX,
} from './builtin/builtin-registry'
export { registerBuiltinPassports } from './builtin/builtin-registry.js'

// Identity
export { AgentService } from './identity/index.js'
export type { CreateAgentInput, AgentBudget, AgentPassportMetadata } from './identity/index.js'
export { validateDelegation } from './identity/index.js'
export type { DelegationResult } from './identity/index.js'
export { PluginService } from './identity/index.js'
export type { PluginSkill, PluginMetadata, CreatePluginInput } from './identity/index.js'
export { McpIdentityService } from './identity/index.js'
export type { RiskLevel, ToolManifestEntry, McpServerMetadata, RegisterMcpInput, ServerManifest } from './identity/index.js'
