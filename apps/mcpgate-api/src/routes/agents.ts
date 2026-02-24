import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync } from '@lucid/gateway-core'
import type { AgentService } from '@lucid/mcpgate'

export async function registerAgentRoutes(app: FastifyInstance, agentService: AgentService) {
  // POST /v1/agents — create an agent identity
  app.post('/v1/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const body = request.body as {
      name?: string
      parent_passport_id?: string
      scopes?: string[]
      budget?: { max_tool_calls?: number; max_cost_usd?: number; ttl_hours?: number }
      framework?: string
      framework_version?: string
      metadata?: Record<string, unknown>
    } | undefined

    if (!body?.name || !body.scopes?.length) {
      return reply.code(400).send({ error: 'Missing required fields: name, scopes' })
    }

    try {
      const agent = await agentService.createAgent({
        name: body.name,
        tenant_id: tenantId,
        parent_passport_id: body.parent_passport_id,
        scopes: body.scopes,
        budget: body.budget,
        framework: body.framework,
        framework_version: body.framework_version,
        metadata: body.metadata,
      })
      return reply.code(201).send(agent)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to create agent' })
    }
  })

  // GET /v1/agents/:id — get agent details
  app.get('/v1/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const agent = await agentService.getAgent(id)

    if (!agent || agent.owner !== tenantId) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    return reply.send(agent)
  })

  // GET /v1/agents — list agents for tenant
  app.get('/v1/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const query = request.query as { page?: string; per_page?: string }
    const result = await agentService.listAgents(tenantId, Number(query.page) || 1, Number(query.per_page) || 20)
    return reply.send(result)
  })

  // DELETE /v1/agents/:id — revoke an agent
  app.delete('/v1/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const agent = await agentService.getAgent(id)

    if (!agent || agent.owner !== tenantId) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    await agentService.revokeAgent(id)
    return reply.code(204).send()
  })
}
