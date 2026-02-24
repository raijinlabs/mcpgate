import dns from 'node:dns'
// Force IPv4 DNS resolution — Railway containers can't reach Supabase over IPv6
dns.setDefaultResultOrder('ipv4first')

import Fastify from 'fastify'
import {
  registerApiKey, setQuotaLimit, upsertTenant,
  createDbClient, registerHealthRoute, seedTenantsFromEnv,
  initApiKeyDb, initTenantDb, initQuotaDb,
} from '@lucid/gateway-core'
import { initPassportStore, getPassportStore } from '@raijinlabs/passport'
import { OutboxWorker } from '@lucid/metering'
import type { DbClient } from '@lucid/gateway-core'
import { ToolRegistry, EnvVarAdapter, CompositeAdapter, SessionStore, ToolSearchIndex, builtinServerCount, listBuiltinServerNames, listBuiltinTools, AgentService, McpIdentityService, PluginService } from '@lucid/mcpgate'
import type { CredentialAdapter } from '@lucid/mcpgate'
import { registerToolRoutes } from './routes/tools'
import { registerServerRoutes } from './routes/servers'
import { registerAuthRoutes } from './routes/auth'
import { registerAuditRoutes } from './routes/audit'
import { registerSessionRoutes } from './routes/sessions'
import { registerAgentRoutes } from './routes/agents'
import { registerMcpRoutes } from './routes/mcp'
import { registerPluginRoutes } from './routes/plugins'
import { registerChainRoutes } from './routes/chains'
import {
  initSentry,
  captureError,
  initTracing,
  flushSentry,
  SERVICE_NAMES,
} from '@lucid/observability'

const OPENMETER_ENABLED = process.env.OPENMETER_ENABLED === 'true'
const DATABASE_URL = process.env.DATABASE_URL || ''

async function buildServer() {
  // Initialize observability before anything else
  initSentry({ serviceName: SERVICE_NAMES.MCPGATE })
  await initTracing({ serviceName: SERVICE_NAMES.MCPGATE })

  const app = Fastify({ logger: true })

  // Sentry error handler for Fastify
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    captureError(error, {
      service: SERVICE_NAMES.MCPGATE,
      operation: `${request.method} ${request.url}`,
    })
    app.log.error(error)
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    })
  })

  // Bootstrap demo tenant
  upsertTenant({ id: 'tenant_demo', name: 'Demo Tenant', plan: 'free' })
  setQuotaLimit('tenant_demo', 1000)
  registerApiKey({ id: 'key_demo', tenantId: 'tenant_demo', rawKey: 'demo-secret-key', createdAt: new Date().toISOString() })

  // Seed production tenants from env
  seedTenantsFromEnv('MCPGATE_SEED_KEYS')

  // DB client (optional)
  const db = createDbClient(DATABASE_URL)

  // Initialize passport store
  if (db) {
    const passportQuery = async (sql: string, params?: unknown[]) => {
      const result = await db.query(sql, params)
      return { rows: result.rows as Record<string, unknown>[] }
    }
    initPassportStore(passportQuery)
    app.log.info('Passport store initialized')

    const gatewayCoreQuery = async (sql: string, params?: unknown[]) => {
      const result = await db.query(sql, params)
      return { rows: result.rows as Record<string, unknown>[] }
    }
    initApiKeyDb(gatewayCoreQuery)
    initTenantDb(gatewayCoreQuery)
    initQuotaDb(gatewayCoreQuery)
    app.log.info('Gateway-core DB-backed services initialized')
  }

  // Shared singletons
  const registry = new ToolRegistry(getPassportStore())
  const agentService = new AgentService(getPassportStore())
  const mcpService = new McpIdentityService(getPassportStore())
  const pluginService = new PluginService(getPassportStore())

  // Build credential adapter chain: NangoAdapter (if configured, SaaS only) → EnvVarAdapter
  const adapters: CredentialAdapter[] = []
  let nangoAdapter: CredentialAdapter | null = null
  if (process.env.NANGO_SECRET_KEY) {
    try {
      const { NangoAdapter } = await import('../../../cloud/mcpgate-cloud/adapters/nango-adapter')
      nangoAdapter = new NangoAdapter()
      adapters.push(nangoAdapter)
    } catch {
      app.log.warn('[nango] NangoAdapter not available — cloud/ module missing or @nangohq/node not installed')
    }
  }
  adapters.push(new EnvVarAdapter())
  const credentials = new CompositeAdapter(adapters)
  const sessionStore = new SessionStore()

  // Build search index from builtin tools
  const searchIndex = new ToolSearchIndex()
  const builtinToolList = await listBuiltinTools()
  const toolEntries = builtinToolList.flatMap(server =>
    server.tools.map(tool => ({
      server_id: server.server_id,
      server_name: server.server_name,
      tool_name: tool.name,
      description: tool.description ?? '',
    }))
  )
  searchIndex.index(toolEntries)
  app.log.info(`[discovery] Indexed ${searchIndex.size} tools for semantic search`)

  // Register routes
  await registerToolRoutes(app, db, registry, credentials, sessionStore, searchIndex)
  await registerServerRoutes(app, db, registry)
  await registerAuthRoutes(app, nangoAdapter)
  await registerAuditRoutes(app, db)
  await registerSessionRoutes(app, sessionStore)
  await registerAgentRoutes(app, agentService)
  await registerMcpRoutes(app, mcpService)
  await registerPluginRoutes(app, pluginService)
  await registerChainRoutes(app, registry, credentials, sessionStore)

  // Start outbox worker
  if (OPENMETER_ENABLED && db) {
    const outbox = new OutboxWorker({ db })
    outbox.start()
    const shutdown = async () => {
      outbox.stop()
      await flushSentry()
      process.exit(0)
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
    app.log.info('[metering] OpenMeter outbox worker started')
  }

  // Log builtin server count
  const builtinCount = builtinServerCount()
  app.log.info(`[builtin] ${builtinCount} builtin MCP servers loaded`)

  // Public catalog endpoint — lists all builtin servers (no auth required)
  app.get('/v1/catalog', async (_request, reply) => {
    const names = listBuiltinServerNames()
    return reply.send({
      builtin_servers: names.length,
      servers: names.map((name) => ({ id: `builtin:${name}`, name })),
    })
  })

  registerHealthRoute(app, 'mcpgate-api')

  return app
}

buildServer()
  .then((app) => app.listen({ port: parseInt(process.env.PORT || '4020', 10), host: '0.0.0.0' }))
  .catch((err) => {
    captureError(err, { service: SERVICE_NAMES.MCPGATE, operation: 'startup' })
    console.error(err)
    process.exit(1)
  })
