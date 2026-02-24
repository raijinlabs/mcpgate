import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { resolveApiKeyAsync, enforceToolPolicy, assertWithinQuotaAsync, enforcePolicyAsync } from '@lucid/gateway-core'
import type { DbClient, ApiKeyRecord } from '@lucid/gateway-core'
import type { ToolRegistry, CredentialAdapter, SessionStore, ToolSearchIndex } from '@lucid/mcpgate'
import {
  toolCallRequestSchema,
  routeToolCall,
  routeToolListFiltered,
  trackToolCall,
  logAuditEvent,
} from '@lucid/mcpgate'

export async function registerToolRoutes(
  app: FastifyInstance,
  db: DbClient | undefined,
  registry: ToolRegistry,
  credentials: CredentialAdapter,
  sessionStore: SessionStore,
  searchIndex: ToolSearchIndex,
) {
  app.post('/v1/tools/call', async (request: FastifyRequest, reply: FastifyReply) => {
    let record: ApiKeyRecord
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const tenantId = record.tenantId

    try {
      await enforcePolicyAsync(tenantId, '/v1/tools/call')
      await assertWithinQuotaAsync(tenantId)
      const body = toolCallRequestSchema.parse(request.body)

      // RBAC check
      if (!enforceToolPolicy(record.scopes, body.server_id, body.tool_name)) {
        if (db) {
          logAuditEvent(db, {
            tenantId,
            apiKeyId: record.id,
            serverId: body.server_id,
            toolName: body.tool_name,
            args: body.arguments,
            status: 'denied',
          })
        }
        return reply.code(403).send({ error: 'Forbidden: API key lacks required scope' })
      }

      const sessionId = request.headers['x-session-id'] as string | undefined
      const result = await routeToolCall(
        registry, credentials, tenantId,
        body.server_id, body.tool_name, body.arguments,
        sessionId ? { sessionId, sessionStore } : undefined,
      )

      // Fire-and-forget metering + audit
      if (db) {
        trackToolCall(db, {
          tenantId,
          toolName: result.tool_name,
          mcpServer: result.server_id,
          durationMs: result.duration_ms,
          statusBucket: result.isError ? 'error' : 'success',
        })
        logAuditEvent(db, {
          tenantId,
          apiKeyId: record.id,
          serverId: result.server_id,
          toolName: result.tool_name,
          args: body.arguments,
          status: 'success',
          durationMs: result.duration_ms,
        })
      }

      return reply.send(result)
    } catch (error) {
      if (db) {
        const body = request.body as { tool_name?: string; server_id?: string; arguments?: Record<string, unknown> } | undefined
        trackToolCall(db, {
          tenantId,
          toolName: body?.tool_name ?? 'unknown',
          mcpServer: body?.server_id ?? 'unknown',
          durationMs: 0,
          statusBucket: 'error',
        })
        logAuditEvent(db, {
          tenantId,
          apiKeyId: record.id,
          serverId: body?.server_id ?? 'unknown',
          toolName: body?.tool_name ?? 'unknown',
          args: body?.arguments,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      const statusCode = (error as { statusCode?: number }).statusCode ?? 400
      return reply.code(statusCode).send({ error: error instanceof Error ? error.message : 'Request failed' })
    }
  })

  app.get('/v1/tools/list', async (request: FastifyRequest, reply: FastifyReply) => {
    let record: ApiKeyRecord
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    try {
      const query = request.query as Record<string, string | undefined>
      const server = query.server
      const search = query.search
      const tools = await routeToolListFiltered(registry, credentials, record.tenantId, {
        server,
        search,
        scopes: record.scopes,
      })
      return reply.send({ tools })
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : 'Failed to list tools' })
    }
  })

  // POST /v1/tools/discover — semantic tool search
  app.post('/v1/tools/discover', async (request: FastifyRequest, reply: FastifyReply) => {
    let record: ApiKeyRecord
    try {
      record = await resolveApiKeyAsync(request)
    } catch (e) {
      return reply.code(401).send({ error: e instanceof Error ? e.message : 'Unauthorized' })
    }

    const body = request.body as { query?: string; top_k?: number } | undefined
    if (!body?.query) {
      return reply.code(400).send({ error: 'Missing query field' })
    }

    const topK = Math.min(body.top_k ?? 10, 50)
    let results = searchIndex.search(body.query, topK)

    // Filter by RBAC scopes
    if (record.scopes) {
      results = results.filter(r =>
        enforceToolPolicy(record.scopes, r.server_id, r.tool_name)
      )
    }

    return reply.send({ results })
  })
}
