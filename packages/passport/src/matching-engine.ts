/**
 * Matching Engine — extracted from Lucid-L2 offchain/src/services/matchingEngine.ts
 *
 * Core function: matchComputeForModel
 * Given a model's metadata, a policy, and a catalog of compute nodes,
 * finds the best compute match that satisfies the policy constraints.
 */

import { evaluatePolicy } from './policy-engine'
import { getComputeRegistry } from './compute-registry'
import type { Policy, ComputeMeta } from './types'

export interface MatchInput {
  model_meta: Record<string, unknown>
  policy: Policy
  compute_catalog: ComputeMeta[]
  require_live_healthy?: boolean
}

export interface MatchExplain {
  policy_hash: string
  candidates_total: number
  candidates_after_policy: number
  selected_compute_id: string | null
  rejection_reasons: Array<{
    compute_id: string
    reasons: string[]
  }>
}

export interface MatchResult {
  match: { compute_passport_id: string; compute_meta: ComputeMeta } | null
  explain: MatchExplain
}

/**
 * Match a model to the best available compute node.
 *
 * Algorithm:
 * 1. For each compute in catalog, evaluate policy constraints
 * 2. Filter to only policy-compliant candidates
 * 3. Optionally filter to only live+healthy (via ComputeRegistry)
 * 4. Select the best candidate (lowest estimated cost, then lowest latency)
 */
export function matchComputeForModel(input: MatchInput): MatchResult {
  const { model_meta, policy, compute_catalog, require_live_healthy = false } = input
  const registry = getComputeRegistry()

  const rejections: MatchExplain['rejection_reasons'] = []
  const candidates: Array<{ id: string; meta: ComputeMeta; cost: number; latency: number }> = []

  for (const computeMeta of compute_catalog) {
    const computeId = (computeMeta as Record<string, unknown>).compute_passport_id as string
    if (!computeId) continue

    // Check if this compute supports the model
    const supportedModels = (computeMeta as Record<string, unknown>).supported_models as string[] | undefined
    const modelBase = (model_meta as Record<string, unknown>).base as string | undefined
    if (supportedModels && modelBase && !supportedModels.includes(modelBase)) {
      rejections.push({ compute_id: computeId, reasons: ['MODEL_NOT_SUPPORTED'] })
      continue
    }

    // Evaluate policy against this compute
    const evalResult = evaluatePolicy({
      policy,
      modelMeta: model_meta,
      computeMeta,
    })

    if (!evalResult.allowed) {
      rejections.push({ compute_id: computeId, reasons: evalResult.reasons })
      continue
    }

    // Check liveness if required
    if (require_live_healthy && !registry.isHealthy(computeId)) {
      rejections.push({ compute_id: computeId, reasons: ['NOT_LIVE_HEALTHY'] })
      continue
    }

    // Extract cost and latency for ranking
    const pricing = ((computeMeta as Record<string, unknown>).pricing || {}) as Record<string, unknown>
    const network = ((computeMeta as Record<string, unknown>).network || {}) as Record<string, unknown>
    const cost = Number(pricing.price_per_1k_tokens_estimate ?? Infinity)
    const latency = Number(network.p95_ms_estimate ?? Infinity)

    candidates.push({ id: computeId, meta: computeMeta, cost, latency })
  }

  // Evaluate policy to get hash (even if no candidates)
  const policyEval = evaluatePolicy({ policy, modelMeta: model_meta })

  // Sort: lowest cost first, then lowest latency
  candidates.sort((a, b) => {
    if (a.cost !== b.cost) return a.cost - b.cost
    return a.latency - b.latency
  })

  const selected = candidates[0] ?? null

  const explain: MatchExplain = {
    policy_hash: policyEval.policy_hash,
    candidates_total: compute_catalog.length,
    candidates_after_policy: candidates.length,
    selected_compute_id: selected?.id ?? null,
    rejection_reasons: rejections,
  }

  return {
    match: selected
      ? { compute_passport_id: selected.id, compute_meta: selected.meta }
      : null,
    explain,
  }
}