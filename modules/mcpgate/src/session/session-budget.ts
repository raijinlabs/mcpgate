/**
 * Session Budgets — spending controls for autonomous agent tool calls.
 *
 * A session wraps a set of budget constraints (call limits, cost caps,
 * server allowlists, tool denylists) and tracks cumulative usage.
 * The enforce() method is called before every tool call to gate execution.
 */

import { randomUUID } from 'node:crypto'

// ── Types ──────────────────────────────────────────────────────────────

export interface SessionBudget {
  max_tool_calls?: number
  max_duration_ms?: number
  max_cost_usd?: number
  allowed_servers?: string[]
  denied_tools?: string[]
  expires_at?: string  // ISO 8601
}

export interface SessionUsage {
  tool_calls: number
  cost_usd: number
}

export type SessionStatus = 'active' | 'exhausted' | 'expired' | 'closed'

export interface Session {
  session_id: string
  tenant_id: string
  agent_id?: string
  budget: SessionBudget
  usage: SessionUsage
  status: SessionStatus
  created_at: number  // epoch ms
  updated_at: number  // epoch ms
}

export interface EnforceResult {
  allowed: boolean
  reason?: string
  code?: 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'SESSION_EXPIRED'
    | 'BUDGET_CALLS_EXCEEDED' | 'BUDGET_DURATION_EXCEEDED'
    | 'BUDGET_COST_EXCEEDED' | 'SERVER_NOT_ALLOWED' | 'TOOL_DENIED'
}

// ── SessionStore ───────────────────────────────────────────────────────

export class SessionStore {
  private sessions = new Map<string, Session>()

  // ── create ────────────────────────────────────────────────────────

  create(tenantId: string, budget: SessionBudget, agentId?: string): Session {
    const session: Session = {
      session_id: `sess_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      tenant_id: tenantId,
      agent_id: agentId,
      budget,
      usage: { tool_calls: 0, cost_usd: 0 },
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.sessions.set(session.session_id, session)
    return session
  }

  // ── get ───────────────────────────────────────────────────────────

  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null
  }

  // ── enforce ───────────────────────────────────────────────────────

  enforce(sessionId: string, serverId: string, toolName: string): EnforceResult {
    const session = this.sessions.get(sessionId)
    if (!session) return { allowed: false, reason: 'Session not found', code: 'SESSION_NOT_FOUND' }

    if (session.status === 'closed') return { allowed: false, reason: 'Session is closed', code: 'SESSION_CLOSED' }
    if (session.status === 'exhausted') return { allowed: false, reason: 'Session budget exhausted', code: 'BUDGET_CALLS_EXCEEDED' }

    // Check expiry
    if (session.budget.expires_at) {
      const expiresAt = new Date(session.budget.expires_at).getTime()
      if (Date.now() > expiresAt) {
        session.status = 'expired'
        session.updated_at = Date.now()
        return { allowed: false, reason: 'Session has expired', code: 'SESSION_EXPIRED' }
      }
    }

    // Check duration
    if (session.budget.max_duration_ms != null) {
      const elapsed = Date.now() - session.created_at
      if (elapsed > session.budget.max_duration_ms) {
        session.status = 'expired'
        session.updated_at = Date.now()
        return { allowed: false, reason: 'Session duration exceeded', code: 'BUDGET_DURATION_EXCEEDED' }
      }
    }

    // Check call count
    if (session.budget.max_tool_calls != null && session.usage.tool_calls >= session.budget.max_tool_calls) {
      session.status = 'exhausted'
      session.updated_at = Date.now()
      return { allowed: false, reason: 'Tool call limit exceeded', code: 'BUDGET_CALLS_EXCEEDED' }
    }

    // Check cost
    if (session.budget.max_cost_usd != null && session.usage.cost_usd >= session.budget.max_cost_usd) {
      session.status = 'exhausted'
      session.updated_at = Date.now()
      return { allowed: false, reason: 'Cost budget exceeded', code: 'BUDGET_COST_EXCEEDED' }
    }

    // Check server allowlist
    if (session.budget.allowed_servers && session.budget.allowed_servers.length > 0) {
      if (!session.budget.allowed_servers.includes(serverId)) {
        return { allowed: false, reason: `Server '${serverId}' not in allowed list`, code: 'SERVER_NOT_ALLOWED' }
      }
    }

    // Check tool denylist
    if (session.budget.denied_tools && session.budget.denied_tools.length > 0) {
      if (session.budget.denied_tools.includes(toolName)) {
        return { allowed: false, reason: `Tool '${toolName}' is denied`, code: 'TOOL_DENIED' }
      }
    }

    return { allowed: true }
  }

  // ── recordUsage ───────────────────────────────────────────────────

  recordUsage(sessionId: string, costUsd = 0): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.usage.tool_calls += 1
    session.usage.cost_usd += costUsd
    session.updated_at = Date.now()
  }

  // ── close ─────────────────────────────────────────────────────────

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.status = 'closed'
    session.updated_at = Date.now()
    return true
  }
}
