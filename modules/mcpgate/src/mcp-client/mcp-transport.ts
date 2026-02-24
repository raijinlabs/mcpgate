import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export type TransportType = 'streamable-http' | 'sse' | 'stdio'

export interface McpServerConfig {
  transport: TransportType
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}

export async function createMcpClient(config: McpServerConfig): Promise<Client> {
  const client = new Client({ name: 'lucid-mcpgate', version: '0.1.0' })

  if (config.transport === 'streamable-http' && config.url) {
    const transport = new StreamableHTTPClientTransport(
      new URL(config.url),
      { requestInit: { headers: config.headers || {} } }
    )
    await client.connect(transport)
  } else if (config.transport === 'sse' && config.url) {
    const transport = new SSEClientTransport(
      new URL(config.url),
      { requestInit: { headers: config.headers || {} } }
    )
    await client.connect(transport)
  } else {
    throw new Error(`Unsupported transport: ${config.transport}`)
  }

  return client
}

export async function callTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: unknown[]; isError: boolean }> {
  const result = await client.callTool({ name: toolName, arguments: args })
  const content = 'content' in result ? (result.content as unknown[]) : []
  const isError = 'isError' in result ? Boolean(result.isError) : false
  return { content, isError }
}

export async function listTools(client: Client): Promise<Array<{ name: string; description?: string }>> {
  const result = await client.listTools()
  return result.tools.map((t) => ({ name: t.name, description: t.description }))
}
