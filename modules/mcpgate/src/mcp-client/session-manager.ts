import { randomUUID } from 'node:crypto'

export interface McpSession {
  id: string
  tenantId: string
  serverId: string
  createdAt: number
  lastUsedAt: number
}

export class SessionManager {
  private sessions = new Map<string, McpSession>()
  private ttlMs: number

  constructor(ttlMs = 30 * 60 * 1000) { // 30 min default
    this.ttlMs = ttlMs
  }

  private key(tenantId: string, serverId: string): string {
    return `${tenantId}:${serverId}`
  }

  getOrCreate(tenantId: string, serverId: string): McpSession {
    const k = this.key(tenantId, serverId)
    const existing = this.sessions.get(k)
    if (existing && Date.now() - existing.lastUsedAt < this.ttlMs) {
      existing.lastUsedAt = Date.now()
      return existing
    }
    const session: McpSession = {
      id: randomUUID(),
      tenantId,
      serverId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    this.sessions.set(k, session)
    return session
  }

  remove(tenantId: string, serverId: string): void {
    this.sessions.delete(this.key(tenantId, serverId))
  }
}
