/**
 * EnvVarAdapter — reads credentials from environment variables.
 *
 * This is the default credential adapter for self-hosters.  It looks up
 * `{PROVIDER}_TOKEN` (bearer) and falls back to `{PROVIDER}_API_KEY` (api_key).
 * Provider names are upper-cased and hyphens are replaced with underscores,
 * so provider `'github'` checks `GITHUB_TOKEN` then `GITHUB_API_KEY`.
 *
 * No OAuth methods are implemented — env vars are inherently static.
 * No `listConnections` — there is no safe way to enumerate env vars.
 */

import type { CredentialAdapter, TokenResult } from './credential-adapter.js'

export class EnvVarAdapter implements CredentialAdapter {
  readonly name = 'env'

  async getToken(_tenantId: string, provider: string): Promise<TokenResult | null> {
    const key = provider.toUpperCase().replace(/-/g, '_')

    const token = process.env[`${key}_TOKEN`]
    if (token) return { token, type: 'bearer' }

    const apiKey = process.env[`${key}_API_KEY`]
    if (apiKey) return { token: apiKey, type: 'api_key' }

    return null
  }
}
