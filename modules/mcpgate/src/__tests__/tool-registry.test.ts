import { describe, it, expect } from 'vitest'
import { ToolRegistry } from '../registry/tool-registry'

describe('ToolRegistry', () => {
  it('registers and lists servers', async () => {
    const mockStore = {
      generateId: () => 'p_1',
      create: async (input: any) => ({ passport_id: 'p_1', ...input, status: 'active', created_at: Date.now(), updated_at: Date.now() }),
      list: async () => ({ items: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 0, has_next: false, has_prev: false } }),
      get: async () => null,
      delete: async () => true,
      update: async () => null,
    }
    const registry = new ToolRegistry(mockStore as any)
    const result = await registry.register('tenant_1', {
      name: 'GitHub',
      transport: 'streamable-http',
      url: 'https://mcp.github.com',
    })
    expect(result.passport_id).toBe('p_1')
  })
})
