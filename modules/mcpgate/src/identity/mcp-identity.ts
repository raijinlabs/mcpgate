/**
 * McpIdentityService — manages MCP server identity via Passport (type='mcp').
 *
 * Provides server manifest generation, publisher verification fields,
 * risk level classification, and category assignment for tool discovery.
 */

import type { PassportStore, Passport } from '@raijinlabs/passport'

// ── Types ──────────────────────────────────────────────────────────────

export type RiskLevel = 'read' | 'write' | 'destructive'

export interface ToolManifestEntry {
  name: string
  description: string
  input_schema?: Record<string, unknown>
  risk_level?: RiskLevel
  cost_hint?: 'free' | 'metered' | 'paid'
}

export interface McpServerMetadata {
  // Transport
  transport: 'streamable-http' | 'sse' | 'stdio' | 'builtin'
  url?: string
  command?: string
  args?: string[]

  // Identity
  publisher_passport_id?: string
  source_url?: string
  checksum?: string
  license?: string
  verified?: boolean
  category?: string

  // Tool manifest
  tools: ToolManifestEntry[]

  // Auth
  auth_provider?: string
  auth_required?: boolean
  auth_scopes_needed?: string[]
}

export interface RegisterMcpInput {
  name: string
  tenant_id: string
  transport: 'streamable-http' | 'sse' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  description?: string
  category?: string
  auth_provider?: string
  source_url?: string
  license?: string
}

export interface ServerManifest {
  passport_id: string
  name: string
  description?: string
  category?: string
  verified: boolean
  tools: ToolManifestEntry[]
  auth_required: boolean
  publisher_passport_id?: string
}

// ── Service ────────────────────────────────────────────────────────────

export class McpIdentityService {
  constructor(private store: PassportStore) {}

  // ── registerServer ────────────────────────────────────────────────

  async registerServer(input: RegisterMcpInput): Promise<Passport> {
    const metadata: McpServerMetadata = {
      transport: input.transport,
      url: input.url,
      command: input.command,
      args: input.args,
      category: input.category,
      auth_provider: input.auth_provider,
      auth_required: !!input.auth_provider,
      source_url: input.source_url,
      license: input.license,
      verified: false,
      tools: [],
    }

    return this.store.create({
      type: 'mcp',
      owner: input.tenant_id,
      name: input.name,
      description: input.description,
      metadata: metadata as unknown as Record<string, unknown>,
    })
  }

  // ── getManifest ───────────────────────────────────────────────────

  async getManifest(passportId: string): Promise<ServerManifest | null> {
    const passport = await this.store.get(passportId)
    if (!passport || passport.type !== 'mcp') return null

    const meta = passport.metadata as unknown as McpServerMetadata

    return {
      passport_id: passport.passport_id,
      name: passport.name ?? passportId,
      description: passport.description,
      category: meta.category,
      verified: meta.verified ?? false,
      tools: meta.tools ?? [],
      auth_required: meta.auth_required ?? false,
      publisher_passport_id: meta.publisher_passport_id,
    }
  }

  // ── updateTools ───────────────────────────────────────────────────

  async updateTools(passportId: string, tools: ToolManifestEntry[]): Promise<void> {
    const passport = await this.store.get(passportId)
    if (!passport || passport.type !== 'mcp') return

    await this.store.update(passportId, {
      metadata: { ...passport.metadata, tools },
    })
  }

  // ── listServers ───────────────────────────────────────────────────

  async listServers(tenantId: string, page = 1, perPage = 20) {
    return this.store.list({
      type: 'mcp',
      owner: tenantId,
      status: 'active',
      page,
      per_page: perPage,
    })
  }
}
