/**
 * CompositeAdapter — chains multiple CredentialAdapters in priority order.
 *
 * For `getToken`, each adapter is tried in sequence and the first non-null
 * TokenResult wins.  For optional methods (`initiateOAuth`, `handleOAuthCallback`,
 * `revokeToken`) the call is delegated to the first adapter that implements the
 * method.  `listConnections` is special: it aggregates results from ALL adapters
 * that implement the method, deduplicating by provider (first adapter wins on
 * conflict).
 *
 * This is the recommended top-level adapter for production deployments that
 * combine env-var, database, and OAuth credential sources.
 */

import type {
  CredentialAdapter,
  TokenResult,
  ConnectionInfo,
} from './credential-adapter.js'

// ── Adapter ────────────────────────────────────────────────────────────

export class CompositeAdapter implements CredentialAdapter {
  readonly name = 'composite'

  private readonly adapters: CredentialAdapter[]

  constructor(adapters: CredentialAdapter[]) {
    this.adapters = adapters
  }

  // ── getToken ──────────────────────────────────────────────────────────

  async getToken(tenantId: string, provider: string): Promise<TokenResult | null> {
    for (const adapter of this.adapters) {
      const result = await adapter.getToken(tenantId, provider)
      if (result !== null) return result
    }
    return null
  }

  // ── initiateOAuth ─────────────────────────────────────────────────────

  async initiateOAuth(tenantId: string, provider: string, callbackUrl: string): Promise<string> {
    for (const adapter of this.adapters) {
      if (adapter.initiateOAuth) {
        return adapter.initiateOAuth(tenantId, provider, callbackUrl)
      }
    }
    throw new Error('No adapter implements initiateOAuth')
  }

  // ── handleOAuthCallback ───────────────────────────────────────────────

  async handleOAuthCallback(tenantId: string, provider: string, code: string): Promise<TokenResult> {
    for (const adapter of this.adapters) {
      if (adapter.handleOAuthCallback) {
        return adapter.handleOAuthCallback(tenantId, provider, code)
      }
    }
    throw new Error('No adapter implements handleOAuthCallback')
  }

  // ── revokeToken ─────────────────────────────────────────────────────

  async revokeToken(tenantId: string, provider: string): Promise<void> {
    for (const adapter of this.adapters) {
      if (adapter.revokeToken) {
        return adapter.revokeToken(tenantId, provider)
      }
    }
    throw new Error('No adapter implements revokeToken')
  }

  // ── listConnections ─────────────────────────────────────────────────

  async listConnections(tenantId: string): Promise<ConnectionInfo[]> {
    const seen = new Set<string>()
    const results: ConnectionInfo[] = []

    for (const adapter of this.adapters) {
      if (adapter.listConnections) {
        const connections = await adapter.listConnections(tenantId)
        for (const conn of connections) {
          if (!seen.has(conn.provider)) {
            seen.add(conn.provider)
            results.push(conn)
          }
        }
      }
    }

    return results
  }
}
