import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveTenantIdAsync } from '@lucid/gateway-core'
import type { DbClient } from '@lucid/gateway-core'
import { queryAuditLogs } from '@lucid/mcpgate'

export async function registerAuditRoutes(app: FastifyInstance, db: DbClient | undefined) {
  app.get('/v1/audit-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    let tenantId: string
    try {
      tenantId = await resolveTenantIdAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    if (!db) {
      return reply.code(501).send({ error: 'Audit logging requires database' })
    }

    const query = request.query as {
      server_id?: string; tool_name?: string; api_key_id?: string;
      status?: string; from?: string; to?: string;
      page?: string; per_page?: string
    }

    try {
      const result = await queryAuditLogs(db, {
        tenantId,
        serverId: query.server_id,
        toolName: query.tool_name,
        apiKeyId: query.api_key_id,
        status: query.status as 'success' | 'error' | 'denied' | undefined,
        from: query.from,
        to: query.to,
        page: query.page ? Number(query.page) : undefined,
        perPage: query.per_page ? Number(query.per_page) : undefined,
      })
      return reply.send(result)
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : 'Failed to query audit logs' })
    }
  })
}
