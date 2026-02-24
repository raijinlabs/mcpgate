import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync } from '@lucid/gateway-core'
import type { McpIdentityService } from '@lucid/mcpgate'

export async function registerMcpRoutes(app: FastifyInstance, mcpService: McpIdentityService) {
  // POST /v1/mcp — register an MCP server identity
  app.post('/v1/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const body = request.body as {
      name?: string
      transport?: 'streamable-http' | 'sse' | 'stdio'
      url?: string
      command?: string
      args?: string[]
      description?: string
      category?: string
      auth_provider?: string
      source_url?: string
      license?: string
    } | undefined

    if (!body?.name || !body.transport) {
      return reply.code(400).send({ error: 'Missing required fields: name, transport' })
    }

    try {
      const server = await mcpService.registerServer({
        name: body.name,
        tenant_id: tenantId,
        transport: body.transport,
        url: body.url,
        command: body.command,
        args: body.args,
        description: body.description,
        category: body.category,
        auth_provider: body.auth_provider,
        source_url: body.source_url,
        license: body.license,
      })
      return reply.code(201).send(server)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to register server' })
    }
  })

  // GET /v1/mcp/:id/manifest — get server manifest
  app.get('/v1/mcp/:id/manifest', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const { id } = request.params as { id: string }
    const manifest = await mcpService.getManifest(id)

    if (!manifest) {
      return reply.code(404).send({ error: 'MCP server not found' })
    }

    return reply.send(manifest)
  })

  // GET /v1/mcp — list MCP servers for tenant
  app.get('/v1/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const query = request.query as { page?: string; per_page?: string }
    const result = await mcpService.listServers(tenantId, Number(query.page) || 1, Number(query.per_page) || 20)
    return reply.send(result)
  })
}
