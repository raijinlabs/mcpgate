import { describe, it, expect } from 'vitest'
import { EnvVarAdapter } from '../auth/env-var-adapter'
import { CompositeAdapter } from '../auth/composite-adapter'
import type { CredentialAdapter } from '../auth/credential-adapter'

describe('CredentialAdapter', () => {
  describe('EnvVarAdapter', () => {
    it('creates an EnvVarAdapter with name "env"', () => {
      const adapter = new EnvVarAdapter()
      expect(adapter).toBeDefined()
      expect(adapter.name).toBe('env')
    })

    it('returns null for credentials when no env var matches', async () => {
      const adapter = new EnvVarAdapter()
      const token = await adapter.getToken('tenant_1', 'nonexistent_provider')
      expect(token).toBeNull()
    })
  })

  describe('CompositeAdapter', () => {
    it('chains multiple adapters', async () => {
      const mock: CredentialAdapter = {
        name: 'mock',
        async getToken() { return null },
      }
      const composite = new CompositeAdapter([mock, new EnvVarAdapter()])
      expect(composite.name).toBe('composite')
      const token = await composite.getToken('tenant_1', 'github')
      expect(token).toBeNull()
    })

    it('returns first non-null token from the chain', async () => {
      const found: CredentialAdapter = {
        name: 'found',
        async getToken() { return { token: 'abc', type: 'bearer' } },
      }
      const composite = new CompositeAdapter([new EnvVarAdapter(), found])
      const token = await composite.getToken('tenant_1', 'github')
      expect(token).toEqual({ token: 'abc', type: 'bearer' })
    })
  })
})
