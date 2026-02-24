import { describe, it, expect } from 'vitest'
import { SessionManager } from '../mcp-client/session-manager'

describe('SessionManager', () => {
  it('creates and retrieves sessions', () => {
    const mgr = new SessionManager()
    const session = mgr.getOrCreate('tenant_1', 'server_github')
    expect(session).toBeDefined()
    expect(session.tenantId).toBe('tenant_1')
    expect(session.serverId).toBe('server_github')
  })

  it('reuses existing session for same tenant+server', () => {
    const mgr = new SessionManager()
    const s1 = mgr.getOrCreate('tenant_1', 'server_github')
    const s2 = mgr.getOrCreate('tenant_1', 'server_github')
    expect(s1.id).toBe(s2.id)
  })

  it('creates separate sessions for different tenants', () => {
    const mgr = new SessionManager()
    const s1 = mgr.getOrCreate('tenant_1', 'server_github')
    const s2 = mgr.getOrCreate('tenant_2', 'server_github')
    expect(s1.id).not.toBe(s2.id)
  })
})
