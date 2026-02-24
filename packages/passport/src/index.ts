/**
 * @lucid/passport — Passport matching engine, policy engine, and store.
 *
 * Extracted from Lucid-L2 for use in both TrustGate and Lucid-L2.
 * Zero blockchain dependencies. Pure TypeScript + Postgres.
 */

// Types
export type {
  Passport,
  PassportType,
  PassportStatus,
  PassportFilters,
  PaginatedResult,
  CreatePassportInput,
  Policy,
  ModelMeta,
  ComputeMeta,
} from './types'

// Store
export {
  PassportStore,
  initPassportStore,
  getPassportStore,
} from './store'
export type { QueryFn } from './store'

// Matching engine
export { matchComputeForModel } from './matching-engine'
export type { MatchInput, MatchResult, MatchExplain } from './matching-engine'

// Policy engine
export { evaluatePolicy } from './policy-engine'
export type { PolicyEvaluateResult, ReasonCode } from './policy-engine'

// Compute registry
export {
  ComputeRegistry,
  getComputeRegistry,
} from './compute-registry'
export type {
  ComputeStatus,
  ComputeHeartbeat,
  ComputeLiveState,
} from './compute-registry'

// Hash utilities
export { canonicalSha256Hex, sha256Hex } from './hash'

// Schema validation
export { validateWithSchema } from './schema-validator'
export type { SchemaId, ValidationResult } from './schema-validator'