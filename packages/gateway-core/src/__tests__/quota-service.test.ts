import { describe, it, expect, beforeEach } from 'vitest'
import { setQuotaLimit, assertWithinQuota, _resetQuotas } from '../quotas/quota-service'

describe('quota-service', () => {
  beforeEach(() => _resetQuotas())

  it('allows requests within quota', () => {
    setQuotaLimit('t1', 2)
    expect(() => assertWithinQuota('t1')).not.toThrow()
    expect(() => assertWithinQuota('t1')).not.toThrow()
  })

  it('throws when quota exceeded', () => {
    setQuotaLimit('t1', 1)
    assertWithinQuota('t1')
    expect(() => assertWithinQuota('t1')).toThrow('Quota exceeded')
  })

  it('defaults to 1000 if no limit set', () => {
    for (let i = 0; i < 1000; i++) assertWithinQuota('t2')
    expect(() => assertWithinQuota('t2')).toThrow('Quota exceeded')
  })
})
