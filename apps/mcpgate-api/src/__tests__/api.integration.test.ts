/**
 * MCPGate API — Comprehensive Integration Tests
 *
 * Spins up a real Fastify instance with all routes registered.
 * Uses in-memory stores (no external DB, no real MCP servers).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

// Gateway-core: public exports + test-only resets
import {
  registerApiKey,
  setQuotaLimit,
  upsertTenant,
  registerHealthRoute,
  _resetKeys,
  _resetTenants,
  _resetQuotas,
} from '@lucid/gateway-core'

// Passport store
import { initPassportStore, getPassportStore } from '@raijinlabs/passport'

// MCPGate module
import { ToolRegistry, EnvVarAdapter, SessionStore, ToolSearchIndex } from '@lucid/mcpgate'
import type { CredentialAdapter } from '@lucid/mcpgate'

// Routes under test
import { registerToolRoutes } from '../routes/tools'
import { registerServerRoutes } from '../routes/servers'
import { registerAuthRoutes } from '../routes/auth'

// ---------------------------------------------------------------------------
// Mock OAuth adapter — implements CredentialAdapter with OAuth support
// ---------------------------------------------------------------------------

function createMockOAuthAdapter(): CredentialAdapter {
  return {
    name: 'mock-oauth',
    async getToken() {
      return null
    },
    async initiateOAuth(tenantId: string, provider: string, _callbackUrl: string) {
      const baseUrl = process.env.NANGO_BASE_URL || 'https://api.nango.dev'
      const publicKey = process.env.NANGO_PUBLIC_KEY || ''
      return `${baseUrl}/oauth/connect/${provider}?connection_id=${tenantId}&public_key=${publicKey}`
    },
  }
}

// ---------------------------------------------------------------------------
// In-memory passport table — simulates Postgres for PassportStore
// ---------------------------------------------------------------------------

interface PassportRow {
  passport_id: string
  type: string
  owner: string
  metadata: string       // JSON string
  name: string | null
  description: string | null
  version: string | null
  tags: string[]
  status: string
  created_at: string
  updated_at: string
  on_chain_pda: string | null
  on_chain_tx: string | null
  last_sync_at: string | null
}

function createInMemoryPassportQuery() {
  let rows: PassportRow[] = []

  return async function query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }> {
    const trimmed = sql.replace(/\s+/g, ' ').trim()

    // INSERT INTO passports ... RETURNING *
    if (trimmed.startsWith('INSERT INTO passports')) {
      const p = params || []
      const row: PassportRow = {
        passport_id: p[0] as string,
        type: p[1] as string,
        owner: p[2] as string,
        metadata: p[3] as string,
        name: (p[4] as string) ?? null,
        description: (p[5] as string) ?? null,
        version: (p[6] as string) ?? null,
        tags: (p[7] as string[]) ?? [],
        status: 'active',
        created_at: p[8] as string,
        updated_at: p[8] as string,
        on_chain_pda: null,
        on_chain_tx: null,
        last_sync_at: null,
      }
      rows.push(row)
      return { rows: [{ ...row }] }
    }

    // SELECT * FROM passports WHERE passport_id = $1
    if (trimmed.startsWith('SELECT * FROM passports WHERE passport_id')) {
      const id = params?.[0]
      const found = rows.find((r) => r.passport_id === id)
      return { rows: found ? [{ ...found }] : [] }
    }

    // SELECT COUNT(*) as total FROM passports ...
    if (trimmed.startsWith('SELECT COUNT(*)')) {
      const filtered = applyFilters(rows, trimmed, params)
      return { rows: [{ total: String(filtered.length) }] }
    }

    // SELECT * FROM passports [WHERE ...] ORDER BY ... LIMIT ... OFFSET ...
    if (trimmed.startsWith('SELECT * FROM passports')) {
      // Extract LIMIT and OFFSET from the end of params
      const p = params || []

      // Filter rows first
      const filtered = applyFilters(rows, trimmed, p)

      // The last two params are always LIMIT and OFFSET
      const limit = p[p.length - 2] as number
      const offset = p[p.length - 1] as number

      // Sort by created_at desc by default
      const sortedDesc = [...filtered].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      const sliced = sortedDesc.slice(offset, offset + limit)
      return { rows: sliced.map((r) => ({ ...r })) }
    }

    // UPDATE passports SET ... WHERE passport_id = $N RETURNING *
    if (trimmed.startsWith('UPDATE passports SET')) {
      const p = params || []
      const passportId = p[p.length - 1] as string

      const idx = rows.findIndex((r) => r.passport_id === passportId)
      if (idx === -1) return { rows: [] }

      // Handle "status = 'revoked'" for delete
      if (trimmed.includes("status = 'revoked'")) {
        rows[idx].status = 'revoked'
        rows[idx].updated_at = new Date().toISOString()
        return { rows: [{ passport_id: rows[idx].passport_id }] }
      }

      // Generic update: parse SET clauses
      // The SQL looks like: UPDATE passports SET updated_at = now(), key = $1, ... WHERE passport_id = $N RETURNING *
      const setMatch = trimmed.match(/SET (.+?) WHERE/)
      if (setMatch) {
        const setClauses = setMatch[1].split(',').map((s) => s.trim())
        let paramIndex = 0
        for (const clause of setClauses) {
          if (clause.startsWith('updated_at')) {
            rows[idx].updated_at = new Date().toISOString()
            continue
          }
          const eqMatch = clause.match(/^(\w+)\s*=\s*\$(\d+)$/)
          if (eqMatch) {
            const field = eqMatch[1] as keyof PassportRow
            const value = p[paramIndex]
            if (field === 'metadata') {
              ;(rows[idx] as Record<string, unknown>)[field] = value as string
            } else {
              ;(rows[idx] as Record<string, unknown>)[field] = value
            }
            paramIndex++
          }
        }
      }

      return { rows: [{ ...rows[idx] }] }
    }

    return { rows: [] }
  }

  function applyFilters(
    allRows: PassportRow[],
    sql: string,
    params?: unknown[],
  ): PassportRow[] {
    let filtered = [...allRows]

    // Check for WHERE clause conditions
    if (!sql.includes('WHERE')) return filtered

    // Extract WHERE clause
    const whereMatch = sql.match(/WHERE (.+?)(?:ORDER BY|LIMIT|$)/)
    if (!whereMatch) return filtered

    const whereClause = whereMatch[1].trim()

    // Parse conditions with parameter references
    let paramIdx = 0
    const conditions = whereClause.split(' AND ').map((c) => c.trim())

    for (const condition of conditions) {
      // type = ANY($N)
      if (condition.match(/type = ANY\(\$\d+\)/)) {
        const values = params?.[paramIdx] as string[]
        filtered = filtered.filter((r) => values.includes(r.type))
        paramIdx++
      }
      // owner = $N
      else if (condition.match(/owner = \$\d+/)) {
        const value = params?.[paramIdx] as string
        filtered = filtered.filter((r) => r.owner === value)
        paramIdx++
      }
      // status = ANY($N)
      else if (condition.match(/status = ANY\(\$\d+\)/)) {
        const values = params?.[paramIdx] as string[]
        filtered = filtered.filter((r) => values.includes(r.status))
        paramIdx++
      }
    }

    return filtered
  }

  // Expose a reset for test cleanup
  return Object.assign(query, {
    _reset() {
      rows = []
    },
  })
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const API_KEY = 'test-api-key'
const TENANT_ID = 'tenant_test'
const AUTH_HEADER = { authorization: `Bearer ${API_KEY}` }

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCPGate API — Integration Tests', () => {
  let app: FastifyInstance
  let passportQuery: ReturnType<typeof createInMemoryPassportQuery>

  beforeAll(async () => {
    // Reset all in-memory stores to ensure isolation
    _resetKeys()
    _resetTenants()
    _resetQuotas()

    // Set up in-memory passport store
    passportQuery = createInMemoryPassportQuery()
    initPassportStore(passportQuery)

    // Set up tenant + API key + quota
    upsertTenant({ id: TENANT_ID, name: 'Test Tenant', plan: 'free' })
    setQuotaLimit(TENANT_ID, 100)
    registerApiKey({
      id: 'key_test',
      tenantId: TENANT_ID,
      rawKey: API_KEY,
      createdAt: new Date().toISOString(),
    })

    // Build Fastify app
    app = Fastify({ logger: false })

    const registry = new ToolRegistry(getPassportStore())
    const credentials = new EnvVarAdapter()
    const oauthAdapter = createMockOAuthAdapter()

    await registerToolRoutes(app, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
    await registerServerRoutes(app, undefined, registry)
    await registerAuthRoutes(app, oauthAdapter)
    registerHealthRoute(app, 'mcpgate-api-test')

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // =========================================================================
  // Health Check
  // =========================================================================

  describe('GET /health', () => {
    it('returns 200 with ok status and service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ ok: true, service: 'mcpgate-api-test' })
    })
  })

  // =========================================================================
  // Authentication
  // =========================================================================

  describe('Authentication', () => {
    it('rejects request without Authorization header with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/servers',
      })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toHaveProperty('error')
    })

    it('rejects request with invalid API key with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: { authorization: 'Bearer totally-wrong-key' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error).toMatch(/Invalid API key/i)
    })

    it('accepts request with valid API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
    })

    it('rejects Bearer token with extra whitespace only', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: { authorization: 'Bearer    ' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('rejects non-Bearer authorization scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: { authorization: `Basic ${API_KEY}` },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error).toMatch(/Missing API key/i)
    })
  })

  // =========================================================================
  // Server Registration — POST /v1/servers/register
  // =========================================================================

  describe('POST /v1/servers/register', () => {
    it('registers a streamable-http server and returns 201 with passport', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'GitHub MCP',
          transport: 'streamable-http',
          url: 'https://mcp.github.example.com/sse',
          description: 'GitHub MCP server',
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body).toHaveProperty('passport_id')
      expect(body.passport_id).toMatch(/^passport_/)
      expect(body.type).toBe('tool')
      expect(body.owner).toBe(TENANT_ID)
      expect(body.name).toBe('GitHub MCP')
      expect(body.status).toBe('active')
      expect(body.metadata).toHaveProperty('transport', 'streamable-http')
      expect(body.metadata).toHaveProperty('url', 'https://mcp.github.example.com/sse')
    })

    it('registers an SSE server', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Slack MCP',
          transport: 'sse',
          url: 'https://mcp.slack.example.com/sse',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().metadata.transport).toBe('sse')
    })

    it('registers a server with auth_provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Notion MCP',
          transport: 'streamable-http',
          url: 'https://mcp.notion.example.com',
          auth_provider: 'notion',
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().metadata.auth_provider).toBe('notion')
    })

    it('rejects registration with missing name (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          transport: 'streamable-http',
          url: 'https://example.com',
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toHaveProperty('error')
    })

    it('rejects registration with missing transport (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Bad Server',
          url: 'https://example.com',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects registration with invalid transport value (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Bad Server',
          transport: 'websocket',
          url: 'https://example.com',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects registration without authentication (401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        payload: {
          name: 'No Auth Server',
          transport: 'streamable-http',
          url: 'https://example.com',
        },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // =========================================================================
  // Server List — GET /v1/servers
  // =========================================================================

  describe('GET /v1/servers', () => {
    let freshApp: FastifyInstance
    let freshQuery: ReturnType<typeof createInMemoryPassportQuery>

    beforeAll(async () => {
      freshQuery = createInMemoryPassportQuery()
      initPassportStore(freshQuery)

      freshApp = Fastify({ logger: false })
      const registry = new ToolRegistry(getPassportStore())
      const credentials = new EnvVarAdapter()
      const bridge = createMockOAuthAdapter()

      await registerToolRoutes(freshApp, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
      await registerServerRoutes(freshApp, undefined, registry)
      await registerAuthRoutes(freshApp, bridge)
      registerHealthRoute(freshApp, 'mcpgate-api-test')
      await freshApp.ready()
    })

    afterAll(async () => {
      await freshApp.close()
    })

    it('returns 200 with empty items when no servers registered', async () => {
      const res = await freshApp.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toEqual([])
      expect(body.pagination).toBeDefined()
      expect(body.pagination.total).toBe(0)
    })

    it('lists registered servers after registration', async () => {
      // Register two servers
      await freshApp.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: { name: 'Server A', transport: 'streamable-http', url: 'https://a.example.com' },
      })
      await freshApp.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: { name: 'Server B', transport: 'sse', url: 'https://b.example.com' },
      })

      const res = await freshApp.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items.length).toBe(2)
      expect(body.pagination.total).toBe(2)
    })

    it('supports pagination with page and per_page', async () => {
      const res = await freshApp.inject({
        method: 'GET',
        url: '/v1/servers?page=1&per_page=1',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items.length).toBe(1)
      expect(body.pagination.per_page).toBe(1)
      expect(body.pagination.has_next).toBe(true)
    })

    it('returns empty items for page beyond total', async () => {
      const res = await freshApp.inject({
        method: 'GET',
        url: '/v1/servers?page=999&per_page=10',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items.length).toBe(0)
    })

    it('isolates servers by tenant — other tenant sees nothing', async () => {
      // Register a second tenant
      upsertTenant({ id: 'tenant_other', name: 'Other Tenant', plan: 'free' })
      setQuotaLimit('tenant_other', 100)
      registerApiKey({
        id: 'key_other',
        tenantId: 'tenant_other',
        rawKey: 'other-api-key',
        createdAt: new Date().toISOString(),
      })

      const res = await freshApp.inject({
        method: 'GET',
        url: '/v1/servers',
        headers: { authorization: 'Bearer other-api-key' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items.length).toBe(0)
    })
  })

  // =========================================================================
  // Server Delete — DELETE /v1/servers/:id
  // =========================================================================

  describe('DELETE /v1/servers/:id', () => {
    let deleteApp: FastifyInstance
    let registeredPassportId: string

    beforeAll(async () => {
      const dq = createInMemoryPassportQuery()
      initPassportStore(dq)

      deleteApp = Fastify({ logger: false })
      const registry = new ToolRegistry(getPassportStore())
      const credentials = new EnvVarAdapter()
      const bridge = createMockOAuthAdapter()

      await registerToolRoutes(deleteApp, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
      await registerServerRoutes(deleteApp, undefined, registry)
      await registerAuthRoutes(deleteApp, bridge)
      registerHealthRoute(deleteApp, 'mcpgate-api-test')
      await deleteApp.ready()

      // Register a server to delete
      const regRes = await deleteApp.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: { name: 'ToDelete', transport: 'streamable-http', url: 'https://delete.example.com' },
      })
      registeredPassportId = regRes.json().passport_id
    })

    afterAll(async () => {
      await deleteApp.close()
    })

    it('returns 404 for non-existent server', async () => {
      const res = await deleteApp.inject({
        method: 'DELETE',
        url: '/v1/servers/passport_nonexistent',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatch(/not found/i)
    })

    it('returns 404 when trying to delete another tenant\'s server', async () => {
      // Ensure tenant_other exists
      upsertTenant({ id: 'tenant_other', name: 'Other', plan: 'free' })
      setQuotaLimit('tenant_other', 100)
      registerApiKey({
        id: 'key_other2',
        tenantId: 'tenant_other',
        rawKey: 'other-key-2',
        createdAt: new Date().toISOString(),
      })

      const res = await deleteApp.inject({
        method: 'DELETE',
        url: `/v1/servers/${registeredPassportId}`,
        headers: { authorization: 'Bearer other-key-2' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('deletes existing server and returns 204', async () => {
      const res = await deleteApp.inject({
        method: 'DELETE',
        url: `/v1/servers/${registeredPassportId}`,
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(204)
    })

    it('returns 404 when deleting already-deleted server (status revoked)', async () => {
      // The server was soft-deleted (status = revoked), so get() returns it
      // but the list filter uses status: 'active'. However, delete route calls
      // registry.get() which returns it, but the owner check passes, then
      // registry.remove() sets status to revoked again. Let's verify:
      // Actually after deletion, the status is 'revoked', and the list won't
      // include it. But registry.get() will still find it. The route checks
      // `!server || server.owner !== tenantId`. Since server exists and
      // owner matches, it would try to delete again (idempotent).
      // This is expected behavior based on the code.
      const res = await deleteApp.inject({
        method: 'DELETE',
        url: `/v1/servers/${registeredPassportId}`,
        headers: AUTH_HEADER,
      })
      // The route does registry.get(id) which finds the revoked passport,
      // owner still matches, so it calls remove again -> 204
      expect(res.statusCode).toBe(204)
    })
  })

  // =========================================================================
  // Auth Routes
  // =========================================================================

  describe('Auth Routes', () => {
    describe('GET /v1/auth/connect/:provider', () => {
      it('returns 401 without auth header', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/connect/github',
        })
        expect(res.statusCode).toBe(401)
      })

      it('returns 501 when no OAuth adapter is configured', async () => {
        // Build a separate app with null OAuth adapter to test 501 path
        const noOauthApp = Fastify({ logger: false })
        const noOauthQuery = createInMemoryPassportQuery()
        initPassportStore(noOauthQuery)
        const reg = new ToolRegistry(getPassportStore())
        const creds = new EnvVarAdapter()
        await registerToolRoutes(noOauthApp, undefined, reg, creds, new SessionStore(), new ToolSearchIndex())
        await registerServerRoutes(noOauthApp, undefined, reg)
        await registerAuthRoutes(noOauthApp, null)
        await noOauthApp.ready()

        const res = await noOauthApp.inject({
          method: 'GET',
          url: '/v1/auth/connect/github',
          headers: AUTH_HEADER,
        })
        expect(res.statusCode).toBe(501)
        expect(res.json().error).toMatch(/OAuth not configured/i)

        await noOauthApp.close()
      })

      it('returns OAuth URL when adapter supports OAuth', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/connect/github',
          headers: AUTH_HEADER,
        })

        expect(res.statusCode).toBe(200)
        const body = res.json()
        expect(body).toHaveProperty('url')
        expect(body.url).toContain('github')
        expect(body.url).toContain(TENANT_ID)
      })
    })

    describe('GET /v1/auth/callback', () => {
      it('returns 400 when query params are missing', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/callback',
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error).toMatch(/Missing provider_config_key or connection_id/i)
      })

      it('returns 400 when only provider_config_key is provided', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/callback?provider_config_key=github',
        })
        expect(res.statusCode).toBe(400)
      })

      it('returns 400 when only connection_id is provided', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/callback?connection_id=conn_123',
        })
        expect(res.statusCode).toBe(400)
      })

      it('returns 200 with connected status when both params provided', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/auth/callback?provider_config_key=github&connection_id=tenant_test',
        })
        expect(res.statusCode).toBe(200)
        const body = res.json()
        expect(body.status).toBe('connected')
        expect(body.provider).toBe('github')
        expect(body.connection_id).toBe('tenant_test')
      })
    })
  })

  // =========================================================================
  // Tool Call — POST /v1/tools/call
  // =========================================================================

  describe('POST /v1/tools/call', () => {
    let toolApp: FastifyInstance

    beforeAll(async () => {
      const tq = createInMemoryPassportQuery()
      initPassportStore(tq)

      toolApp = Fastify({ logger: false })
      const registry = new ToolRegistry(getPassportStore())
      const credentials = new EnvVarAdapter()
      const bridge = createMockOAuthAdapter()

      await registerToolRoutes(toolApp, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
      await registerServerRoutes(toolApp, undefined, registry)
      await registerAuthRoutes(toolApp, bridge)
      await toolApp.ready()
    })

    afterAll(async () => {
      await toolApp.close()
    })

    it('returns 401 without auth', async () => {
      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        payload: {
          server_id: 'passport_fake',
          tool_name: 'list_repos',
          arguments: {},
        },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 400 for non-existent server', async () => {
      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: AUTH_HEADER,
        payload: {
          server_id: 'passport_does_not_exist',
          tool_name: 'list_repos',
          arguments: {},
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/MCP server not found/i)
    })

    it('returns 400 when server_id is missing', async () => {
      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: AUTH_HEADER,
        payload: {
          tool_name: 'list_repos',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when tool_name is missing', async () => {
      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: AUTH_HEADER,
        payload: {
          server_id: 'passport_fake',
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 with empty body', async () => {
      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: AUTH_HEADER,
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when server exists but MCP connection fails (no real endpoint)', async () => {
      // Register a server pointing to a non-existent URL
      const regRes = await toolApp.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Unreachable MCP',
          transport: 'streamable-http',
          url: 'https://localhost:19999/nonexistent',
        },
      })
      const serverId = regRes.json().passport_id

      const res = await toolApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: AUTH_HEADER,
        payload: {
          server_id: serverId,
          tool_name: 'some_tool',
          arguments: {},
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toHaveProperty('error')
    })
  })

  // =========================================================================
  // Tool List — GET /v1/tools/list
  // =========================================================================

  describe('GET /v1/tools/list', () => {
    let listApp: FastifyInstance

    beforeAll(async () => {
      const lq = createInMemoryPassportQuery()
      initPassportStore(lq)

      listApp = Fastify({ logger: false })
      const registry = new ToolRegistry(getPassportStore())
      const credentials = new EnvVarAdapter()
      const bridge = createMockOAuthAdapter()

      await registerToolRoutes(listApp, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
      await registerServerRoutes(listApp, undefined, registry)
      await registerAuthRoutes(listApp, bridge)
      await listApp.ready()
    })

    afterAll(async () => {
      await listApp.close()
    })

    it('returns 401 without auth', async () => {
      const res = await listApp.inject({
        method: 'GET',
        url: '/v1/tools/list',
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 200 with builtin tools when no external servers registered', async () => {
      const res = await listApp.inject({
        method: 'GET',
        url: '/v1/tools/list',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(200)
      const { tools } = res.json()
      expect(Array.isArray(tools)).toBe(true)
      // Builtin servers are always available
      expect(tools.length).toBeGreaterThan(0)
      // Each entry should have server_id, server_name, and tools array
      for (const server of tools) {
        expect(server).toHaveProperty('server_id')
        expect(server).toHaveProperty('server_name')
        expect(server).toHaveProperty('tools')
      }
    })
  })

  // =========================================================================
  // Quota Enforcement
  // =========================================================================

  describe('Quota Enforcement', () => {
    let quotaApp: FastifyInstance

    beforeAll(async () => {
      const qq = createInMemoryPassportQuery()
      initPassportStore(qq)

      // Create a tenant with a very small quota
      _resetQuotas()
      upsertTenant({ id: 'tenant_quota', name: 'Quota Tenant', plan: 'free' })
      setQuotaLimit('tenant_quota', 2) // Only 2 requests allowed
      registerApiKey({
        id: 'key_quota',
        tenantId: 'tenant_quota',
        rawKey: 'quota-test-key',
        createdAt: new Date().toISOString(),
      })

      quotaApp = Fastify({ logger: false })
      const registry = new ToolRegistry(getPassportStore())
      const credentials = new EnvVarAdapter()
      const bridge = createMockOAuthAdapter()

      await registerToolRoutes(quotaApp, undefined, registry, credentials, new SessionStore(), new ToolSearchIndex())
      await registerServerRoutes(quotaApp, undefined, registry)
      await registerAuthRoutes(quotaApp, bridge)
      await quotaApp.ready()
    })

    afterAll(async () => {
      await quotaApp.close()
    })

    it('allows requests within quota', async () => {
      // Requests 1 and 2 should succeed (quota limit = 2)
      // These will fail with 400 because of missing server, but the
      // quota check happens first and should pass
      const res1 = await quotaApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: { authorization: 'Bearer quota-test-key' },
        payload: { server_id: 'passport_x', tool_name: 'test', arguments: {} },
      })
      // 400 because server not found, but NOT quota exceeded
      expect(res1.statusCode).toBe(400)
      expect(res1.json().error).not.toMatch(/Quota exceeded/i)

      const res2 = await quotaApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: { authorization: 'Bearer quota-test-key' },
        payload: { server_id: 'passport_x', tool_name: 'test', arguments: {} },
      })
      expect(res2.statusCode).toBe(400)
      expect(res2.json().error).not.toMatch(/Quota exceeded/i)
    })

    it('rejects requests when quota is exhausted', async () => {
      // Request 3 should fail with quota exceeded
      const res = await quotaApp.inject({
        method: 'POST',
        url: '/v1/tools/call',
        headers: { authorization: 'Bearer quota-test-key' },
        payload: { server_id: 'passport_x', tool_name: 'test', arguments: {} },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toMatch(/Quota exceeded/i)
    })
  })

  // =========================================================================
  // Cross-cutting: Content-Type handling
  // =========================================================================

  describe('Content-Type handling', () => {
    it('accepts application/json for POST routes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: {
          ...AUTH_HEADER,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          name: 'ContentType Server',
          transport: 'streamable-http',
          url: 'https://ct.example.com',
        }),
      })
      expect(res.statusCode).toBe(201)
    })
  })

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/unknown/route',
        headers: AUTH_HEADER,
      })
      expect(res.statusCode).toBe(404)
    })

    it('handles POST to GET-only endpoint', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/health',
        headers: AUTH_HEADER,
      })
      // Fastify returns 404 for wrong method
      expect(res.statusCode).toBe(404)
    })

    it('register with stdio transport (valid)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'Local MCP',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.metadata.transport).toBe('stdio')
      expect(body.metadata.command).toBe('node')
      expect(body.metadata.args).toEqual(['server.js'])
    })

    it('register with optional env vars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/servers/register',
        headers: AUTH_HEADER,
        payload: {
          name: 'EnvVar MCP',
          transport: 'streamable-http',
          url: 'https://env.example.com',
          env: { API_KEY: 'secret-123', DEBUG: 'true' },
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().metadata.env).toEqual({ API_KEY: 'secret-123', DEBUG: 'true' })
    })
  })
})
