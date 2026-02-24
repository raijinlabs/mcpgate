import { describe, it, expect } from 'vitest'
import { toolCallRequestSchema, serverRegisterSchema } from '../schemas/mcp-request'

describe('MCP request schemas', () => {
  it('validates a tool call request', () => {
    const result = toolCallRequestSchema.safeParse({
      server_id: 'srv_github',
      tool_name: 'create_issue',
      arguments: { title: 'Bug', body: 'Fix it' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects tool call missing tool_name', () => {
    const result = toolCallRequestSchema.safeParse({
      server_id: 'srv_github',
      arguments: {},
    })
    expect(result.success).toBe(false)
  })

  it('validates server registration', () => {
    const result = serverRegisterSchema.safeParse({
      name: 'GitHub MCP',
      transport: 'streamable-http',
      url: 'https://mcp.github.com',
      description: 'GitHub integration',
    })
    expect(result.success).toBe(true)
  })
})
