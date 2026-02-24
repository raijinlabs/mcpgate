export type ToolCallResponse = {
  content: unknown[]
  isError?: boolean
  server_id: string
  tool_name: string
  duration_ms: number
}

export type ServerInfo = {
  id: string
  name: string
  transport: string
  url?: string
  description?: string
  tools: string[]
  status: 'active' | 'degraded' | 'offline'
}
