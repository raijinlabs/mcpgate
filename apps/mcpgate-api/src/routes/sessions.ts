import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveApiKeyAsync } from '@lucid/gateway-core'
import type { SessionStore } from '@lucid/mcpgate'

export async function registerSessionRoutes(app: FastifyInstance, sessionStore: SessionStore) {
  // POST /v1/sessions — create a new session with budget constraints
  app.post('/v1/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    let record
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const body = request.body as {
      budget?: {
        max_tool_calls?: number
        max_duration_ms?: number
        max_cost_usd?: number
        allowed_servers?: string[]
        denied_tools?: string[]
        expires_at?: string
      }
      agent_id?: string
    } | undefined

    if (!body?.budget) {
      return reply.code(400).send({ error: 'Missing budget object' })
    }

    const session = sessionStore.create(record.tenantId, body.budget, body.agent_id)
    return reply.code(201).send(session)
  })

  // GET /v1/sessions/:id — get session status and usage
  app.get('/v1/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    let record
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const session = sessionStore.get(id)

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    // Ensure tenant owns this session
    if (session.tenant_id !== record.tenantId) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    return reply.send(session)
  })

  // DELETE /v1/sessions/:id — close a session
  app.delete('/v1/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    let record
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const session = sessionStore.get(id)

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    if (session.tenant_id !== record.tenantId) {
      return reply.code(404).send({ error: 'Session not found' })
    }

    sessionStore.close(id)
    return reply.code(204).send()
  })
}
