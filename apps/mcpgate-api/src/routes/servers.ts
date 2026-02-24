import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync } from '@lucid/gateway-core'
import type { DbClient } from '@lucid/gateway-core'
import type { ToolRegistry } from '@lucid/mcpgate'
import { serverRegisterSchema } from '@lucid/mcpgate'

export async function registerServerRoutes(app: FastifyInstance, _db: DbClient | undefined, registry: ToolRegistry) {

  app.post('/v1/servers/register', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    try {
      const body = serverRegisterSchema.parse(request.body)
      const passport = await registry.register(tenantId, body)
      return reply.code(201).send(passport)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Registration failed' })
    }
  })

  app.get('/v1/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const query = request.query as { page?: string; per_page?: string }
    const servers = await registry.list(tenantId, Number(query.page) || 1, Number(query.per_page) || 20)
    return reply.send(servers)
  })

  app.delete('/v1/servers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const server = await registry.get(id)
    if (!server || server.owner !== tenantId) {
      return reply.code(404).send({ error: 'Server not found' })
    }

    await registry.remove(id)
    return reply.code(204).send()
  })
}
