/**
 * Delegation — enforces parent -> child scope subsetting and budget constraints.
 *
 * A child agent can never have more permissions or budget than its parent.
 * This module validates delegation requests at creation time.
 */

import type { AgentPassportMetadata, AgentBudget } from './agent-service.js'

// ── Types ──────────────────────────────────────────────────────────────

export interface DelegationResult {
  valid: boolean
  reason?: string
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_DELEGATION_DEPTH = 3

// ── Validation ─────────────────────────────────────────────────────────

/** Check if childScopes is a subset of parentScopes (supports wildcards). */
function isScopeSubset(parentScopes: string[], childScopes: string[]): boolean {
  return childScopes.every(childScope => {
    return parentScopes.some(parentScope => {
      if (parentScope === '*') return true
      if (parentScope === childScope) return true
      // Wildcard matching: "github:*" covers "github:search_code"
      if (parentScope.endsWith(':*')) {
        const prefix = parentScope.slice(0, -1)  // "github:"
        return childScope.startsWith(prefix)
      }
      return false
    })
  })
}

export function validateDelegation(
  parentMeta: AgentPassportMetadata,
  childScopes: string[],
  childBudget: AgentBudget,
): DelegationResult {
  // Check delegation depth
  if ((parentMeta.delegation_depth ?? 0) >= MAX_DELEGATION_DEPTH) {
    return { valid: false, reason: `Max delegation depth (${MAX_DELEGATION_DEPTH}) exceeded` }
  }

  // Check scope subsetting
  if (!isScopeSubset(parentMeta.scopes, childScopes)) {
    return { valid: false, reason: 'Child scopes exceed parent scopes' }
  }

  // Check budget limits
  if (childBudget.max_tool_calls != null && parentMeta.budget.max_tool_calls != null) {
    if (childBudget.max_tool_calls > parentMeta.budget.max_tool_calls) {
      return { valid: false, reason: 'Child tool call budget exceeds parent' }
    }
  }

  if (childBudget.max_cost_usd != null && parentMeta.budget.max_cost_usd != null) {
    if (childBudget.max_cost_usd > parentMeta.budget.max_cost_usd) {
      return { valid: false, reason: 'Child cost budget exceeds parent' }
    }
  }

  if (childBudget.ttl_hours != null && parentMeta.budget.ttl_hours != null) {
    if (childBudget.ttl_hours > parentMeta.budget.ttl_hours) {
      return { valid: false, reason: 'Child TTL exceeds parent' }
    }
  }

  return { valid: true }
}
