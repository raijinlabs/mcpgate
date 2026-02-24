import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveApiKeyAsync, enforceToolPolicy, enforcePolicyAsync } from '@lucid/gateway-core'
import { executeChain, routeToolCall } from '@lucid/mcpgate'
import type { ToolRegistry, CredentialAdapter, SessionStore, ChainStep } from '@lucid/mcpgate'

export async function registerChainRoutes(
  app: FastifyInstance,
  registry: ToolRegistry,
  credentials: CredentialAdapter,
  sessionStore: SessionStore,
) {
  // POST /v1/chains/execute — execute a multi-tool chain
  app.post('/v1/chains/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    let record
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const tenantId = record.tenantId

    try {
      await enforcePolicyAsync(tenantId, '/v1/chains/execute', { feature: 'chains' })
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 400
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : 'Request failed' })
    }

    const body = request.body as {
      session_id?: string
      steps?: ChainStep[]
      on_error?: 'stop' | 'continue'
    } | undefined

    if (!body?.steps?.length) {
      return reply.code(400).send({ error: 'Missing required field: steps (non-empty array)' })
    }

    // Validate all step IDs are unique
    const ids = new Set(body.steps.map(s => s.id))
    if (ids.size !== body.steps.length) {
      return reply.code(400).send({ error: 'Duplicate step IDs' })
    }

    // RBAC: check all tools in the chain are allowed
    if (record.scopes) {
      for (const step of body.steps) {
        if (!enforceToolPolicy(record.scopes, step.server, step.tool)) {
          return reply.code(403).send({
            error: `Forbidden: API key lacks scope for ${step.server}/${step.tool}`,
          })
        }
      }
    }

    try {
      const sessionId = body.session_id ?? (request.headers['x-session-id'] as string | undefined)

      const result = await executeChain(
        {
          session_id: sessionId,
          steps: body.steps,
          on_error: body.on_error,
        },
        async (serverId, toolName, args) => {
          const callResult = await routeToolCall(
            registry, credentials, tenantId,
            serverId, toolName, args,
            sessionId ? { sessionId, sessionStore } : undefined,
          )
          return { content: callResult.content, isError: callResult.isError }
        },
      )

      return reply.send(result)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Chain execution failed' })
    }
  })
}
