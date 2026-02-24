import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import {
  registerApiKey, setQuotaLimit, upsertTenant, registerHealthRoute,
} from '@lucid/gateway-core'

describe('MCPGate API integration', () => {
  const app = Fastify()
  const API_KEY = 'test-mcp-key'

  beforeAll(async () => {
    upsertTenant({ id: 'test_tenant', name: 'Test', plan: 'free' })
    setQuotaLimit('test_tenant', 1000)
    registerApiKey({ id: 'k_test', tenantId: 'test_tenant', rawKey: API_KEY, createdAt: new Date().toISOString() })
    registerHealthRoute(app, 'mcpgate-test')
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, service: 'mcpgate-test' })
  })
})
