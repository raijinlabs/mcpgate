/**
 * AgentService — thin layer over PassportStore for agent identity.
 *
 * Agents are Passports with `type: 'agent'`.  This service adds
 * agent-specific logic: scoped API keys, delegation validation,
 * budget tracking, and framework metadata.
 */

import type { PassportStore, Passport } from '@raijinlabs/passport'
import { validateDelegation } from './delegation.js'

// ── Types ──────────────────────────────────────────────────────────────

export interface AgentBudget {
  max_tool_calls?: number
  max_cost_usd?: number
  ttl_hours?: number
}

export interface CreateAgentInput {
  name: string
  tenant_id: string
  parent_passport_id?: string
  scopes: string[]
  budget?: AgentBudget
  metadata?: Record<string, unknown>
  framework?: string
  framework_version?: string
}

export interface AgentPassportMetadata {
  parent_passport_id?: string
  framework?: string
  framework_version?: string
  scopes: string[]
  budget: AgentBudget
  expires_at?: string
  delegation_depth: number
  root_passport_id?: string
}

// ── Service ────────────────────────────────────────────────────────────

export class AgentService {
  constructor(private store: PassportStore) {}

  // ── createAgent ───────────────────────────────────────────────────

  async createAgent(input: CreateAgentInput): Promise<Passport> {
    let delegationDepth = 0
    let rootPassportId: string | undefined

    // If this agent has a parent, validate delegation
    if (input.parent_passport_id) {
      const parent = await this.store.get(input.parent_passport_id)
      if (!parent || parent.type !== 'agent') {
        throw new Error('Parent agent not found')
      }
      const parentMeta = parent.metadata as unknown as AgentPassportMetadata

      const validation = validateDelegation(parentMeta, input.scopes, input.budget ?? {})
      if (!validation.valid) {
        throw new Error(`Delegation denied: ${validation.reason}`)
      }

      delegationDepth = (parentMeta.delegation_depth ?? 0) + 1
      rootPassportId = parentMeta.root_passport_id ?? parent.passport_id
    }

    const expiresAt = input.budget?.ttl_hours
      ? new Date(Date.now() + input.budget.ttl_hours * 3600_000).toISOString()
      : undefined

    const agentMeta: AgentPassportMetadata = {
      parent_passport_id: input.parent_passport_id,
      framework: input.framework,
      framework_version: input.framework_version,
      scopes: input.scopes,
      budget: input.budget ?? {},
      expires_at: expiresAt,
      delegation_depth: delegationDepth,
      root_passport_id: rootPassportId,
      ...input.metadata,
    }

    return this.store.create({
      type: 'agent',
      owner: input.tenant_id,
      name: input.name,
      metadata: agentMeta as unknown as Record<string, unknown>,
    })
  }

  // ── getAgent ──────────────────────────────────────────────────────

  async getAgent(passportId: string): Promise<Passport | null> {
    const passport = await this.store.get(passportId)
    if (!passport || passport.type !== 'agent') return null
    return passport
  }

  // ── listAgents ────────────────────────────────────────────────────

  async listAgents(tenantId: string, page = 1, perPage = 20) {
    return this.store.list({
      type: 'agent',
      owner: tenantId,
      status: 'active',
      page,
      per_page: perPage,
    })
  }

  // ── revokeAgent ───────────────────────────────────────────────────

  async revokeAgent(passportId: string): Promise<boolean> {
    const passport = await this.store.get(passportId)
    if (!passport || passport.type !== 'agent') return false
    await this.store.update(passportId, { status: 'revoked' })
    return true
  }
}
