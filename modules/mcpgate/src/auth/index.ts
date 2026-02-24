// Auth barrel — re-exports all public types and utilities.

export type { TokenResult, ConnectionInfo, CredentialAdapter } from './credential-adapter.js'
export { EnvVarAdapter } from './env-var-adapter.js'
export { DatabaseAdapter } from './database-adapter.js'
export type { QueryFn } from './database-adapter.js'
export { CompositeAdapter } from './composite-adapter.js'
