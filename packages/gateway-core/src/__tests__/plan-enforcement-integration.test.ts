/**
 * Plan Enforcement — Integration Tests
 *
 * Tests the enforcePolicyAsync function with tenant lifecycle scenarios:
 * - Free tenant blocked from gated features
 * - Pro tenant allowed gated features
 * - Plan upgrade unblocks features
 * - getTenantAsync fallback to in-memory when no DB
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  enforcePolicyAsync,
  upsertTenant,
  getTenantAsync,
  _resetTenants,
} from '../index'

describe('Plan Enforcement — Integration', () => {
  beforeEach(() => {
    _resetTenants()
  })

  // =========================================================================
  // Free tenant blocked from gated features
  // =========================================================================

  describe('Free tenant feature gating', () => {
    it('blocks free tenant from chains feature with 403', async () => {
      upsertTenant({ id: 't-free-1', name: 'Free Org', plan: 'free' })

      try {
        await enforcePolicyAsync('t-free-1', '/v1/chains/execute', { feature: 'chains' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
        expect(err.message).toMatch(/requires plan upgrade/)
        expect(err.message).toContain('chains')
      }
    })

    it('blocks free tenant from plugins feature with 403', async () => {
      upsertTenant({ id: 't-free-2', name: 'Free Org', plan: 'free' })

      try {
        await enforcePolicyAsync('t-free-2', '/v1/plugins', { feature: 'plugins' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
        expect(err.message).toMatch(/requires plan upgrade/)
        expect(err.message).toContain('plugins')
      }
    })

    it('blocks free tenant from streaming feature with 403', async () => {
      upsertTenant({ id: 't-free-3', name: 'Free Org', plan: 'free' })

      try {
        await enforcePolicyAsync('t-free-3', '/v1/chat/completions', { feature: 'streaming' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
      }
    })

    it('allows free tenant to access non-gated endpoints', async () => {
      upsertTenant({ id: 't-free-4', name: 'Free Org', plan: 'free' })

      // No feature gate — just tenant existence check
      await expect(
        enforcePolicyAsync('t-free-4', '/v1/tools/call')
      ).resolves.toBeUndefined()
    })
  })

  // =========================================================================
  // Pro tenant allowed gated features
  // =========================================================================

  describe('Pro tenant feature access', () => {
    it('allows pro tenant to use chains feature', async () => {
      upsertTenant({ id: 't-pro-1', name: 'Pro Org', plan: 'pro' })

      await expect(
        enforcePolicyAsync('t-pro-1', '/v1/chains/execute', { feature: 'chains' })
      ).resolves.toBeUndefined()
    })

    it('allows pro tenant to use plugins feature', async () => {
      upsertTenant({ id: 't-pro-2', name: 'Pro Org', plan: 'pro' })

      await expect(
        enforcePolicyAsync('t-pro-2', '/v1/plugins', { feature: 'plugins' })
      ).resolves.toBeUndefined()
    })

    it('allows pro tenant to use streaming feature', async () => {
      upsertTenant({ id: 't-pro-3', name: 'Pro Org', plan: 'pro' })

      await expect(
        enforcePolicyAsync('t-pro-3', '/v1/chat/completions', { feature: 'streaming' })
      ).resolves.toBeUndefined()
    })

    it('blocks pro tenant from growth-only features', async () => {
      upsertTenant({ id: 't-pro-4', name: 'Pro Org', plan: 'pro' })

      try {
        await enforcePolicyAsync('t-pro-4', '/v1/servers/register', { feature: 'custom_servers' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
        expect(err.message).toContain('custom_servers')
      }
    })
  })

  // =========================================================================
  // Plan upgrade unblocks features
  // =========================================================================

  describe('Plan upgrade unblocks features', () => {
    it('upgrading from free to pro unblocks chains', async () => {
      upsertTenant({ id: 't-upgrade', name: 'Upgrading Org', plan: 'free' })

      // Chains should be blocked on free
      try {
        await enforcePolicyAsync('t-upgrade', '/v1/chains/execute', { feature: 'chains' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
      }

      // Upgrade to pro
      upsertTenant({ id: 't-upgrade', name: 'Upgrading Org', plan: 'pro' })

      // Now chains should be allowed
      await expect(
        enforcePolicyAsync('t-upgrade', '/v1/chains/execute', { feature: 'chains' })
      ).resolves.toBeUndefined()
    })

    it('upgrading from pro to growth unblocks custom_servers', async () => {
      upsertTenant({ id: 't-upgrade-2', name: 'Scaling Org', plan: 'pro' })

      // custom_servers should be blocked on pro
      try {
        await enforcePolicyAsync('t-upgrade-2', '/v1/servers/register', { feature: 'custom_servers' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
      }

      // Upgrade to growth
      upsertTenant({ id: 't-upgrade-2', name: 'Scaling Org', plan: 'growth' })

      // Now custom_servers should be allowed
      await expect(
        enforcePolicyAsync('t-upgrade-2', '/v1/servers/register', { feature: 'custom_servers' })
      ).resolves.toBeUndefined()
    })

    it('downgrading from pro to free re-blocks features', async () => {
      upsertTenant({ id: 't-downgrade', name: 'Downgrade Org', plan: 'pro' })

      // Chains allowed on pro
      await expect(
        enforcePolicyAsync('t-downgrade', '/v1/chains/execute', { feature: 'chains' })
      ).resolves.toBeUndefined()

      // Downgrade to free
      upsertTenant({ id: 't-downgrade', name: 'Downgrade Org', plan: 'free' })

      // Chains blocked again
      try {
        await enforcePolicyAsync('t-downgrade', '/v1/chains/execute', { feature: 'chains' })
        expect.fail('should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(403)
      }
    })
  })

  // =========================================================================
  // getTenantAsync falls back to in-memory when no DB
  // =========================================================================

  describe('getTenantAsync in-memory fallback', () => {
    it('returns tenant from in-memory store when no DB is configured', async () => {
      // No DB has been initialized (initTenantDb not called), so getTenantAsync
      // should fall back to the in-memory Map
      upsertTenant({ id: 't-inmem', name: 'InMemory Org', plan: 'pro' })

      const tenant = await getTenantAsync('t-inmem')
      expect(tenant).not.toBeNull()
      expect(tenant!.id).toBe('t-inmem')
      expect(tenant!.plan).toBe('pro')
    })

    it('returns null for non-existent tenant in in-memory store', async () => {
      const tenant = await getTenantAsync('non-existent-tenant')
      expect(tenant).toBeNull()
    })

    it('enforcePolicyAsync works end-to-end with in-memory tenant', async () => {
      upsertTenant({ id: 't-e2e', name: 'E2E Org', plan: 'growth' })

      // Growth plan should have all features
      await expect(
        enforcePolicyAsync('t-e2e', '/v1/chains/execute', { feature: 'chains' })
      ).resolves.toBeUndefined()
      await expect(
        enforcePolicyAsync('t-e2e', '/v1/plugins', { feature: 'plugins' })
      ).resolves.toBeUndefined()
      await expect(
        enforcePolicyAsync('t-e2e', '/v1/servers/register', { feature: 'custom_servers' })
      ).resolves.toBeUndefined()
    })
  })
})
