import type { PassportStore, Passport, PaginatedResult } from '@raijinlabs/passport'

export interface RegisterServerInput {
  name: string
  transport: 'streamable-http' | 'sse' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  description?: string
  auth_provider?: string
}

export class ToolRegistry {
  constructor(private store: PassportStore) {}

  async register(tenantId: string, input: RegisterServerInput): Promise<Passport> {
    return this.store.create({
      type: 'mcp',
      owner: tenantId,
      name: input.name,
      description: input.description,
      metadata: {
        transport: input.transport,
        url: input.url,
        command: input.command,
        args: input.args,
        env: input.env,
        auth_provider: input.auth_provider,
        tools: [], // populated after first connection
      },
    })
  }

  async list(tenantId: string, page = 1, perPage = 20): Promise<PaginatedResult<Passport>> {
    return this.store.list({
      type: 'mcp',
      owner: tenantId,
      status: 'active',
      page,
      per_page: perPage,
    })
  }

  async get(passportId: string): Promise<Passport | null> {
    return this.store.get(passportId)
  }

  async remove(passportId: string): Promise<boolean> {
    return this.store.delete(passportId)
  }

  async updateTools(passportId: string, tools: string[]): Promise<void> {
    const passport = await this.store.get(passportId)
    if (!passport) return
    await this.store.update(passportId, {
      metadata: { ...passport.metadata, tools },
    })
  }
}
