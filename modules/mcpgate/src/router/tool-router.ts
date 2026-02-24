import type { ToolRegistry } from '../registry/tool-registry'
import type { CredentialAdapter, TokenResult } from '../auth/credential-adapter.js'
import type { SessionStore } from '../session/session-budget.js'
import { createMcpClient, callTool, listTools, type McpServerConfig } from '../mcp-client/mcp-transport'
import { SessionManager } from '../mcp-client/session-manager'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { markHealthy, markUnhealthy } from '../registry/server-health'
import { enforceToolPolicy } from '@lucid/gateway-core'
import {
  isBuiltinServer, extractBuiltinName,
  listBuiltinTools, callBuiltinTool,
} from '../builtin/builtin-registry'

/** Time-to-live for idle MCP clients (30 minutes, matching SessionManager). */
const CLIENT_TTL_MS = 30 * 60 * 1000

/** Cleanup interval — every 5 minutes. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

interface ClientEntry {
  client: Client
  lastUsedAt: number
}

const clients = new Map<string, ClientEntry>()
const sessionManager = new SessionManager()

/** Remove clients that have not been used within CLIENT_TTL_MS. */
function cleanupStaleClients(): void {
  const now = Date.now()
  for (const [key, entry] of clients) {
    if (now - entry.lastUsedAt > CLIENT_TTL_MS) {
      clients.delete(key)
      try {
        if (typeof (entry.client as unknown as { close?: () => void }).close === 'function') {
          ;(entry.client as unknown as { close: () => void }).close()
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
}

setInterval(cleanupStaleClients, CLEANUP_INTERVAL_MS)

export interface ToolCallResult {
  content: unknown[]
  isError: boolean
  server_id: string
  tool_name: string
  duration_ms: number
  tool_passport_id: string
}

export interface ToolCallOptions {
  sessionId?: string
  sessionStore?: SessionStore
  costUsd?: number
}

export async function routeToolCall(
  registry: ToolRegistry,
  credentials: CredentialAdapter,
  tenantId: string,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: ToolCallOptions,
): Promise<ToolCallResult> {
  // Session budget enforcement (if session provided)
  if (options?.sessionId && options.sessionStore) {
    const check = options.sessionStore.enforce(options.sessionId, serverId, toolName)
    if (!check.allowed) {
      throw new Error(`Session budget: ${check.reason}`)
    }
  }

  // Handle builtin servers (in-process, no Passport registration needed)
  if (isBuiltinServer(serverId)) {
    const serverName = extractBuiltinName(serverId)
    const start = Date.now()
    try {
      const result = await callBuiltinTool(serverName, toolName, args)
      if (options?.sessionId && options.sessionStore) {
        options.sessionStore.recordUsage(options.sessionId, options?.costUsd)
      }
      return {
        ...result,
        server_id: serverId,
        tool_name: toolName,
        duration_ms: Date.now() - start,
        tool_passport_id: serverId,
      }
    } catch (err) {
      throw new Error(`Builtin tool call failed (${serverName}/${toolName}): ${err instanceof Error ? err.message : err}`)
    }
  }

  const server = await registry.get(serverId)
  if (!server || server.owner !== tenantId) {
    throw new Error(`MCP server not found: ${serverId}`)
  }

  const meta = server.metadata as Record<string, unknown>
  const config: McpServerConfig = {
    transport: meta.transport as McpServerConfig['transport'],
    url: meta.url as string | undefined,
    command: meta.command as string | undefined,
    args: meta.args as string[] | undefined,
  }

  const authProvider = meta.auth_provider as string | undefined
  if (authProvider) {
    const tokenResult = await credentials.getToken(tenantId, authProvider)
    if (tokenResult) {
      const authHeader =
        tokenResult.type === 'bearer' ? `Bearer ${tokenResult.token}`
        : tokenResult.type === 'basic' ? `Basic ${tokenResult.token}`
        : tokenResult.token
      config.headers = { Authorization: authHeader, ...tokenResult.headers }
    }
  }

  const clientKey = `${tenantId}:${serverId}`
  let entry = clients.get(clientKey)
  if (!entry) {
    const client = await createMcpClient(config)
    entry = { client, lastUsedAt: Date.now() }
    clients.set(clientKey, entry)
  } else {
    entry.lastUsedAt = Date.now()
  }

  sessionManager.getOrCreate(tenantId, serverId)

  const start = Date.now()
  try {
    const result = await callTool(entry.client, toolName, args)
    const durationMs = Date.now() - start
    markHealthy(serverId)
    if (options?.sessionId && options.sessionStore) {
      options.sessionStore.recordUsage(options.sessionId, options?.costUsd)
    }
    return {
      ...result,
      server_id: serverId,
      tool_name: toolName,
      duration_ms: durationMs,
      tool_passport_id: server.passport_id,
    }
  } catch (err) {
    clients.delete(clientKey)
    markUnhealthy(serverId, err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

export async function routeToolList(
  registry: ToolRegistry,
  credentials: CredentialAdapter,
  tenantId: string,
): Promise<Array<{ server_id: string; server_name: string; tools: Array<{ name: string; description?: string }> }>> {
  // Fetch builtin and registered tools in parallel
  const [builtinTools, registeredServers] = await Promise.all([
    listBuiltinTools(),
    registry.list(tenantId, 1, 100),
  ])

  const settled = await Promise.allSettled(
    registeredServers.items.map(async (server) => {
      const meta = server.metadata as Record<string, unknown>
      const config: McpServerConfig = {
        transport: meta.transport as McpServerConfig['transport'],
        url: meta.url as string | undefined,
      }

      // Inject auth headers (same as routeToolCall)
      const authProvider = meta.auth_provider as string | undefined
      if (authProvider) {
        const tokenResult = await credentials.getToken(tenantId, authProvider)
        if (tokenResult) {
          const authHeader =
            tokenResult.type === 'bearer' ? `Bearer ${tokenResult.token}`
            : tokenResult.type === 'basic' ? `Basic ${tokenResult.token}`
            : tokenResult.token
          config.headers = { Authorization: authHeader, ...tokenResult.headers }
        }
      }

      const clientKey = `${tenantId}:${server.passport_id}`
      let entry = clients.get(clientKey)
      if (!entry) {
        const client = await createMcpClient(config)
        entry = { client, lastUsedAt: Date.now() }
        clients.set(clientKey, entry)
      } else {
        entry.lastUsedAt = Date.now()
      }

      const tools = await listTools(entry.client)
      await registry.updateTools(server.passport_id, tools.map((t) => t.name))
      return { server_id: server.passport_id, server_name: server.name || '', tools }
    }),
  )

  const registeredTools = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    const server = registeredServers.items[index]
    return { server_id: server.passport_id, server_name: server.name || '', tools: [] }
  })

  // Merge: builtins first, then registered servers
  return [...builtinTools, ...registeredTools]
}

export interface ToolListFilters {
  server?: string
  search?: string
  scopes?: string[] | null
}

export async function routeToolListFiltered(
  registry: ToolRegistry,
  credentials: CredentialAdapter,
  tenantId: string,
  filters: ToolListFilters,
): Promise<Array<{ server_id: string; server_name: string; tools: Array<{ name: string; description?: string }> }>> {
  const allTools = await routeToolList(registry, credentials, tenantId)
  let result = allTools

  // Filter by server name/id
  if (filters.server) {
    const q = filters.server.toLowerCase()
    result = result.filter(s =>
      s.server_id.toLowerCase().includes(q) ||
      s.server_name.toLowerCase().includes(q)
    )
  }

  // Filter by search query (matches tool name or description)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.map(s => ({
      ...s,
      tools: s.tools.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false)
      ),
    })).filter(s => s.tools.length > 0)
  }

  // Filter by RBAC scopes
  if (filters.scopes != null) {
    result = result.map(s => ({
      ...s,
      tools: s.tools.filter(t =>
        enforceToolPolicy(filters.scopes!, s.server_id, t.name)
      ),
    })).filter(s => s.tools.length > 0)
  }

  return result
}
