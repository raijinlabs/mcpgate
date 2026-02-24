import { describe, it, expect, beforeEach } from 'vitest'
import { hashApiKey, registerApiKey, verifyApiKey, _resetKeys } from '../auth/api-key-service'

describe('api-key-service', () => {
  beforeEach(() => _resetKeys())

  it('hashes a key deterministically', () => {
    const h1 = hashApiKey('test-key')
    const h2 = hashApiKey('test-key')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it('registers and verifies a key', () => {
    registerApiKey({ id: 'k1', tenantId: 't1', rawKey: 'secret', createdAt: '2026-01-01' })
    const record = verifyApiKey('secret')
    expect(record).not.toBeNull()
    expect(record!.tenantId).toBe('t1')
  })

  it('returns null for unknown key', () => {
    expect(verifyApiKey('nope')).toBeNull()
  })

  it('returns null for disabled key', () => {
    registerApiKey({ id: 'k2', tenantId: 't1', rawKey: 'disabled-key', createdAt: '2026-01-01', disabled: true })
    expect(verifyApiKey('disabled-key')).toBeNull()
  })
})
