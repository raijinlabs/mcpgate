import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync } from '@lucid/gateway-core'
import type { CredentialAdapter } from '@lucid/mcpgate'

export async function registerAuthRoutes(app: FastifyInstance, oauthAdapter: CredentialAdapter | null) {
  app.get('/v1/auth/connect/:provider', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { provider } = request.params as { provider: string }

    if (!oauthAdapter?.initiateOAuth) {
      return reply.code(501).send({ error: 'OAuth not configured (no credential adapter with OAuth support)' })
    }

    const callbackUrl = `${request.protocol}://${request.hostname}/v1/auth/callback`
    const oauthUrl = await oauthAdapter.initiateOAuth(tenantId, provider, callbackUrl)
    return reply.send({ url: oauthUrl })
  })

  // OAuth callback — Nango redirects here after the user authorises
  app.get('/v1/auth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { provider_config_key?: string; connection_id?: string }
    const provider = query.provider_config_key || ''
    const connectionId = query.connection_id || ''

    if (!provider || !connectionId) {
      return reply.code(400).send({ error: 'Missing provider_config_key or connection_id' })
    }

    return reply.send({ status: 'connected', provider, connection_id: connectionId })
  })
}
