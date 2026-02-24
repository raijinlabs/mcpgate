/**
 * Unit tests for the matching engine.
 * Run with: npx vitest run packages/passport/src/__tests__/
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { matchComputeForModel } from '../matching-engine'
import type { Policy, ComputeMeta } from '../types'

// Minimal policy that allows everything
const PERMISSIVE_POLICY: Policy = { policy_version: '1.0' }

// Restrictive policy requiring a specific region
const REGION_POLICY: Policy = {
  policy_version: '1.0',
  geo: { allowed_regions: ['us-east-1'] },
}

const MODEL_META = {
  model_passport_id: 'openai-gpt4o',
  base: 'gpt-4o',
  provider: 'openai',
}

function makeCompute(overrides: Partial<Record<string, unknown>> = {}): ComputeMeta {
  return {
    compute_passport_id: 'compute-a',
    provider: 'cloud-a',
    supported_models: ['gpt-4o'],
    region: 'us-east-1',
    pricing: { price_per_1k_tokens_estimate: 0.01 },
    network: { p95_ms_estimate: 100 },
    ...overrides,
  } as unknown as ComputeMeta
}

describe('matchComputeForModel', () => {
  it('returns a match when a compliant compute exists', () => {
    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [makeCompute()],
    })

    expect(result.match).not.toBeNull()
    expect(result.match!.compute_passport_id).toBe('compute-a')
    expect(result.explain.candidates_after_policy).toBe(1)
    expect(result.explain.policy_hash).toBeTruthy()
  })

  it('returns null match when catalog is empty', () => {
    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [],
    })

    expect(result.match).toBeNull()
    expect(result.explain.candidates_total).toBe(0)
    expect(result.explain.candidates_after_policy).toBe(0)
  })

  it('rejects compute that does not support the model', () => {
    const compute = makeCompute({ supported_models: ['llama-3.1-70b'] })
    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [compute],
    })

    expect(result.match).toBeNull()
    expect(result.explain.rejection_reasons).toHaveLength(1)
    expect(result.explain.rejection_reasons[0].reasons).toContain('MODEL_NOT_SUPPORTED')
  })

  it('selects the cheapest compute when multiple candidates', () => {
    const cheapCompute = makeCompute({
      compute_passport_id: 'cheap',
      pricing: { price_per_1k_tokens_estimate: 0.001 },
    })
    const expensiveCompute = makeCompute({
      compute_passport_id: 'expensive',
      pricing: { price_per_1k_tokens_estimate: 0.1 },
    })

    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [expensiveCompute, cheapCompute],
    })

    expect(result.match).not.toBeNull()
    expect(result.match!.compute_passport_id).toBe('cheap')
  })

  it('breaks cost ties by lowest latency', () => {
    const fastCompute = makeCompute({
      compute_passport_id: 'fast',
      pricing: { price_per_1k_tokens_estimate: 0.01 },
      network: { p95_ms_estimate: 50 },
    })
    const slowCompute = makeCompute({
      compute_passport_id: 'slow',
      pricing: { price_per_1k_tokens_estimate: 0.01 },
      network: { p95_ms_estimate: 500 },
    })

    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [slowCompute, fastCompute],
    })

    expect(result.match!.compute_passport_id).toBe('fast')
  })

  it('skips compute entries without compute_passport_id', () => {
    const noId = makeCompute({ compute_passport_id: undefined })
    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [noId],
    })

    expect(result.match).toBeNull()
    expect(result.explain.rejection_reasons).toHaveLength(0)
  })

  it('includes policy_hash in explain even with no candidates', () => {
    const result = matchComputeForModel({
      model_meta: MODEL_META,
      policy: PERMISSIVE_POLICY,
      compute_catalog: [],
    })

    expect(result.explain.policy_hash).toBeTruthy()
    expect(typeof result.explain.policy_hash).toBe('string')
  })
})