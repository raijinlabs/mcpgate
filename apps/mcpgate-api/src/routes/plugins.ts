import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync, enforcePolicyAsync } from '@lucid/gateway-core'
import type { PluginService } from '@lucid/mcpgate'

export async function registerPluginRoutes(app: FastifyInstance, pluginService: PluginService) {
  // GET /v1/plugins — list available plugins
  app.get('/v1/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const query = request.query as { category?: string; page?: string; per_page?: string }
    const page = Number(query.page) || 1
    const perPage = Number(query.per_page) || 20

    const result = query.category
      ? await pluginService.listByCategory(query.category, page, perPage)
      : await pluginService.listPlugins(page, perPage)

    return reply.send(result)
  })

  // GET /v1/plugins/:id — get plugin details
  app.get('/v1/plugins/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const plugin = await pluginService.getPlugin(id)

    if (!plugin) {
      return reply.code(404).send({ error: 'Plugin not found' })
    }

    return reply.send(plugin)
  })

  // POST /v1/plugins — create a plugin
  app.post('/v1/plugins', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    try {
      await enforcePolicyAsync(tenantId, '/v1/plugins', { feature: 'plugins' })
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 400
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : 'Request failed' })
    }

    const body = request.body as {
      name?: string
      description?: string
      category?: string
      risk_level?: 'read' | 'write' | 'destructive'
      server_passport_ids?: string[]
      skills?: Array<{
        name: string
        description: string
        instructions: string
        required_tools: string[]
        trigger_patterns?: string[]
      }>
      required_credentials?: string[]
      source_url?: string
      license?: string
    } | undefined

    if (!body?.name || !body.category || !body.risk_level || !body.server_passport_ids?.length || !body.skills?.length) {
      return reply.code(400).send({ error: 'Missing required fields: name, category, risk_level, server_passport_ids, skills' })
    }

    try {
      const plugin = await pluginService.createPlugin({
        name: body.name,
        tenant_id: tenantId,
        description: body.description,
        category: body.category,
        risk_level: body.risk_level,
        server_passport_ids: body.server_passport_ids,
        skills: body.skills,
        required_credentials: body.required_credentials,
        source_url: body.source_url,
        license: body.license,
      })
      return reply.code(201).send(plugin)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to create plugin' })
    }
  })
}
