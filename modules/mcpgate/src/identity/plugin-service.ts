/**
 * PluginService — manages installable plugin bundles via Passport (type='plugin').
 *
 * A plugin bundles MCP servers + skills + config into a single installable
 * unit.  Skills are defined as instructions + tool dependencies inside the
 * plugin's passport metadata.
 */

import type { PassportStore, Passport } from '@raijinlabs/passport'

// ── Types ──────────────────────────────────────────────────────────────

export interface PluginSkill {
  name: string
  description: string
  instructions: string
  required_tools: string[]
  trigger_patterns?: string[]
}

export interface PluginMetadata {
  publisher_passport_id: string
  checksum?: string
  source_url?: string
  license?: string
  category: string
  risk_level: 'read' | 'write' | 'destructive'
  server_passport_ids: string[]
  skills: PluginSkill[]
  required_credentials: string[]
  config_schema?: Record<string, unknown>
  verified: boolean
}

export interface CreatePluginInput {
  name: string
  tenant_id: string
  description?: string
  category: string
  risk_level: 'read' | 'write' | 'destructive'
  server_passport_ids: string[]
  skills: PluginSkill[]
  required_credentials?: string[]
  source_url?: string
  license?: string
}

// ── Service ────────────────────────────────────────────────────────────

export class PluginService {
  constructor(private store: PassportStore) {}

  // ── createPlugin ──────────────────────────────────────────────────

  async createPlugin(input: CreatePluginInput): Promise<Passport> {
    const metadata: PluginMetadata = {
      publisher_passport_id: input.tenant_id,
      source_url: input.source_url,
      license: input.license,
      category: input.category,
      risk_level: input.risk_level,
      server_passport_ids: input.server_passport_ids,
      skills: input.skills,
      required_credentials: input.required_credentials ?? [],
      verified: false,
    }

    return this.store.create({
      type: 'plugin',
      owner: input.tenant_id,
      name: input.name,
      description: input.description,
      metadata: metadata as unknown as Record<string, unknown>,
      tags: [input.category],
    })
  }

  // ── getPlugin ─────────────────────────────────────────────────────

  async getPlugin(passportId: string): Promise<Passport | null> {
    const passport = await this.store.get(passportId)
    if (!passport || passport.type !== 'plugin') return null
    return passport
  }

  // ── listPlugins ───────────────────────────────────────────────────

  async listPlugins(page = 1, perPage = 20) {
    return this.store.list({
      type: 'plugin',
      status: 'active',
      page,
      per_page: perPage,
    })
  }

  // ── listByCategory ────────────────────────────────────────────────

  async listByCategory(category: string, page = 1, perPage = 20) {
    return this.store.list({
      type: 'plugin',
      status: 'active',
      tags: [category],
      page,
      per_page: perPage,
    })
  }
}
