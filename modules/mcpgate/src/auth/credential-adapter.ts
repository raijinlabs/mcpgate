/**
 * CredentialAdapter — unified interface for credential retrieval.
 *
 * Replaces the tightly-coupled CredentialProvider / NangoBridge pair with a
 * pluggable adapter contract.  Every credential source (environment variables,
 * database, Nango, composite) implements this single interface.
 */

// ── Result & info types ─────────────────────────────────────────────

/** Token returned by a credential adapter. */
export interface TokenResult {
  token: string
  type: 'bearer' | 'api_key' | 'basic'
  /** Unix epoch in milliseconds when the token expires. */
  expiresAt?: number
  /** Refresh token managed by the adapter (not the caller). */
  refreshToken?: string
  /** Arbitrary auth headers to merge into outbound requests. */
  headers?: Record<string, string>
}

/** Summary of a single provider connection for a tenant. */
export interface ConnectionInfo {
  provider: string
  status: 'connected' | 'expired' | 'error'
  /** Unix epoch ms when the connection was established. */
  connectedAt?: number
  /** Unix epoch ms when the connection / token expires. */
  expiresAt?: number
}

// ── Adapter contract ────────────────────────────────────────────────

export interface CredentialAdapter {
  /** Human-readable adapter name (e.g. "nango", "env", "database"). */
  readonly name: string

  /** Get an access token for a provider + tenant. */
  getToken(tenantId: string, provider: string): Promise<TokenResult | null>

  /** Initiate an OAuth flow — returns the redirect URL. */
  initiateOAuth?(tenantId: string, provider: string, callbackUrl: string): Promise<string>

  /** Handle the OAuth callback — exchange the authorization code for a token. */
  handleOAuthCallback?(tenantId: string, provider: string, code: string): Promise<TokenResult>

  /** Revoke stored credentials for a provider + tenant. */
  revokeToken?(tenantId: string, provider: string): Promise<void>

  /** List all connected providers for a tenant. */
  listConnections?(tenantId: string): Promise<ConnectionInfo[]>
}
