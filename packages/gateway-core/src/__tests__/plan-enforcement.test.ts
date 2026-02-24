import { describe, it, expect, beforeEach } from 'vitest'
import { getPlanLimits, upsertTenant, enforcePolicyAsync, _resetTenants } from '../index'

describe('plan-config', () => {
  it('getPlanLimits("free") returns correct limits', () => {
    const limits = getPlanLimits('free')
    expect(limits.maxRequestsPerDay).toBe(1000)
    expect(limits.maxToolCallsPerDay).toBe(500)
    expect(limits.maxModelsAllowed).toBe(3)
    expect(limits.maxApiKeys).toBe(2)
    expect(limits.maxAgents).toBe(1)
    expect(limits.rateLimitPerMinute).toBe(60)
    expect(limits.features.size).toBe(0)
  })

  it('getPlanLimits("pro") has chains/plugins features', () => {
    const limits = getPlanLimits('pro')
    expect(limits.maxRequestsPerDay).toBe(50_000)
    expect(limits.features.has('chains')).toBe(true)
    expect(limits.features.has('plugins')).toBe(true)
    expect(limits.features.has('streaming')).toBe(true)
    expect(limits.features.has('custom_servers')).toBe(false)
  })

  it('getPlanLimits("growth") has all features including custom_servers', () => {
    const limits = getPlanLimits('growth')
    expect(limits.maxRequestsPerDay).toBe(500_000)
    expect(limits.features.has('chains')).toBe(true)
    expect(limits.features.has('plugins')).toBe(true)
    expect(limits.features.has('streaming')).toBe(true)
    expect(limits.features.has('custom_servers')).toBe(true)
    expect(limits.features.has('priority_support')).toBe(true)
  })

  it('getPlanLimits("unknown") falls back to free', () => {
    const limits = getPlanLimits('unknown')
    const freeLimits = getPlanLimits('free')
    expect(limits).toBe(freeLimits)
  })
})

describe('enforcePolicyAsync', () => {
  beforeEach(() => _resetTenants())

  it('throws 404 for unknown tenant', async () => {
    try {
      await enforcePolicyAsync('non-existent', '/api/test')
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err.statusCode).toBe(404)
      expect(err.message).toMatch(/Unknown tenant/)
    }
  })

  it('throws 403 for gated features on free plan', async () => {
    upsertTenant({ id: 't-free', name: 'Free Tenant', plan: 'free' })
    try {
      await enforcePolicyAsync('t-free', '/api/test', { feature: 'chains' })
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err.statusCode).toBe(403)
      expect(err.message).toMatch(/requires plan upgrade/)
    }
  })

  it('allows gated features on pro plan', async () => {
    upsertTenant({ id: 't-pro', name: 'Pro Tenant', plan: 'pro' })
    await expect(
      enforcePolicyAsync('t-pro', '/api/test', { feature: 'chains' })
    ).resolves.toBeUndefined()
  })

  it('allows all features on growth plan', async () => {
    upsertTenant({ id: 't-growth', name: 'Growth Tenant', plan: 'growth' })
    await expect(
      enforcePolicyAsync('t-growth', '/api/test', { feature: 'custom_servers' })
    ).resolves.toBeUndefined()
    await expect(
      enforcePolicyAsync('t-growth', '/api/test', { feature: 'priority_support' })
    ).resolves.toBeUndefined()
  })
})
