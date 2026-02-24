/**
 * Policy Engine — extracted verbatim from Lucid-L2 offchain/src/services/policyEngine.ts
 *
 * Deterministic policy evaluation:
 * - Pure: no network calls.
 * - Explainable: stable reason codes.
 * - Deterministic hashing: policy_hash = sha256(JCS(policy)).
 */

import { canonicalSha256Hex } from './hash'
import { validateWithSchema } from './schema-validator'
import type { Policy, ModelMeta, ComputeMeta } from './types'

export type ReasonCode =
  | 'INVALID_POLICY'
  | 'REGION_NOT_ALLOWED'
  | 'RESIDENCY_REQUIRED_NOT_SUPPORTED'
  | 'ATTESTATION_REQUIRED_NOT_SUPPORTED'
  | 'CC_ON_REQUIRED_NOT_SUPPORTED'
  | 'LATENCY_BUDGET_EXCEEDED'
  | 'COST_BUDGET_EXCEEDED'

export interface PolicyEvaluateResult {
  allowed: boolean
  reasons: ReasonCode[]
  policy_hash: string
}

export function evaluatePolicy(input: {
  policy: Policy
  modelMeta?: ModelMeta
  computeMeta?: ComputeMeta
}): PolicyEvaluateResult {
  const { policy, computeMeta } = input

  const pv = validateWithSchema('Policy', policy)
  if (!pv.ok) {
    return {
      allowed: false,
      reasons: ['INVALID_POLICY'],
      policy_hash: canonicalSha256Hex(policy),
    }
  }

  const policy_hash = canonicalSha256Hex(policy)
  const reasons: ReasonCode[] = []

  // Region constraint
  const allowRegions: string[] = Array.isArray(
    (policy as Record<string, unknown>).allow_regions
  )
    ? ((policy as Record<string, unknown>).allow_regions as string[])
    : []

  if (computeMeta && allowRegions.length > 0) {
    const regions: string[] = Array.isArray(
      (computeMeta as Record<string, unknown>).regions
    )
      ? ((computeMeta as Record<string, unknown>).regions as string[])
      : []
    const ok = regions.some((r) => allowRegions.includes(r))
    if (!ok) reasons.push('REGION_NOT_ALLOWED')
  }

  // Residency
  if (
    computeMeta &&
    (policy as Record<string, unknown>).residency_required === true
  ) {
    if (
      (computeMeta as Record<string, unknown>).residency_supported !== true
    ) {
      reasons.push('RESIDENCY_REQUIRED_NOT_SUPPORTED')
    }
  }

  // Attestation + CC-on
  const att = ((policy as Record<string, unknown>).attestation ||
    {}) as Record<string, unknown>
  if (computeMeta) {
    const caps = ((computeMeta as Record<string, unknown>).capabilities ||
      {}) as Record<string, unknown>
    if (att.attestation_required === true && caps.supports_attestation !== true) {
      reasons.push('ATTESTATION_REQUIRED_NOT_SUPPORTED')
    }
    if (att.require_cc_on === true && caps.supports_cc_on !== true) {
      reasons.push('CC_ON_REQUIRED_NOT_SUPPORTED')
    }
  }

  // Latency
  const latency = ((policy as Record<string, unknown>).latency || {}) as Record<
    string,
    unknown
  >
  if (computeMeta && latency.p95_ms_budget != null) {
    const budget = Number(latency.p95_ms_budget)
    const network = ((computeMeta as Record<string, unknown>).network ||
      {}) as Record<string, unknown>
    const p95 = Number(network.p95_ms_estimate ?? 0)
    if (Number.isFinite(budget) && Number.isFinite(p95) && p95 > 0 && p95 > budget) {
      reasons.push('LATENCY_BUDGET_EXCEEDED')
    }
  }

  // Cost
  const cost = ((policy as Record<string, unknown>).cost || {}) as Record<
    string,
    unknown
  >
  if (computeMeta && cost.max_price_per_1k_tokens_usd != null) {
    const max = Number(cost.max_price_per_1k_tokens_usd)
    const pricing = ((computeMeta as Record<string, unknown>).pricing ||
      {}) as Record<string, unknown>
    const est = Number(pricing.price_per_1k_tokens_estimate ?? 0)
    if (Number.isFinite(max) && Number.isFinite(est) && est > 0 && est > max) {
      reasons.push('COST_BUDGET_EXCEEDED')
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    policy_hash,
  }
}