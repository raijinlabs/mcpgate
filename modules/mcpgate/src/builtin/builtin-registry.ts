/**
 * Builtin Server Registry
 *
 * Imports all 88 MCP server definitions and exposes them for in-process
 * tool listing and execution via the MCP SDK's InMemoryTransport.
 *
 * Builtin servers are available to ALL tenants without Passport registration.
 * Credentials come from environment variables (same as standalone deployments).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { PassportStore } from '@raijinlabs/passport'

import * as servers from '../servers/index.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuiltinToolInfo {
  server_id: string
  server_name: string
  tools: Array<{ name: string; description?: string }>
}

interface BuiltinEntry {
  mcpServer: McpServer
  client?: Client
  connecting?: Promise<Client>
}

// ---------------------------------------------------------------------------
// Registry State
// ---------------------------------------------------------------------------

const registry = new Map<string, BuiltinEntry>()
let initialized = false

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function ensureInitialized(): void {
  if (initialized) return
  initialized = true

  for (const [, mcpServer] of Object.entries(servers)) {
    if (!mcpServer || typeof mcpServer !== 'object') continue

    // Get server name from the McpServer's underlying Server instance
    // Note: _serverInfo is a private field in the SDK
    const serverObj = (mcpServer as McpServer).server as Record<string, unknown> | undefined
    const serverInfo = (serverObj?._serverInfo ?? serverObj?.serverInfo) as { name?: string } | undefined
    const name = serverInfo?.name
    if (!name) continue

    registry.set(name, { mcpServer: mcpServer as McpServer })
  }
}

// ---------------------------------------------------------------------------
// Lazy Client Connection
// ---------------------------------------------------------------------------

async function getClient(serverName: string): Promise<Client> {
  ensureInitialized()

  const entry = registry.get(serverName)
  if (!entry) throw new Error(`Builtin server not found: ${serverName}`)

  if (entry.client) return entry.client

  if (!entry.connecting) {
    entry.connecting = (async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await entry.mcpServer.connect(serverTransport)
      const client = new Client({ name: 'mcpgate-builtin', version: '0.1.0' })
      await client.connect(clientTransport)
      entry.client = client
      return client
    })()
  }

  return entry.connecting
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Prefix used to identify builtin server IDs in the routing layer. */
export const BUILTIN_PREFIX = 'builtin:'

export function isBuiltinServer(serverId: string): boolean {
  return serverId.startsWith(BUILTIN_PREFIX)
}

export function extractBuiltinName(serverId: string): string {
  return serverId.slice(BUILTIN_PREFIX.length)
}

/** Returns the number of registered builtin servers. */
export function builtinServerCount(): number {
  ensureInitialized()
  return registry.size
}

/** Returns all builtin server names. */
export function listBuiltinServerNames(): string[] {
  ensureInitialized()
  return Array.from(registry.keys())
}

/**
 * List tools from ALL builtin servers.
 * Connects lazily to each server on first call, then caches.
 */
export async function listBuiltinTools(): Promise<BuiltinToolInfo[]> {
  ensureInitialized()

  const entries = Array.from(registry.entries())
  const settled = await Promise.allSettled(
    entries.map(async ([name]) => {
      const client = await getClient(name)
      const result = await client.listTools()
      return {
        server_id: `${BUILTIN_PREFIX}${name}`,
        server_name: name,
        tools: result.tools.map((t) => ({ name: t.name, description: t.description })),
      }
    }),
  )

  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value
    return { server_id: `${BUILTIN_PREFIX}${entries[i][0]}`, server_name: entries[i][0], tools: [] }
  })
}

/**
 * Call a tool on a builtin server.
 */
export async function callBuiltinTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: unknown[]; isError: boolean }> {
  const client = await getClient(serverName)
  const result = await client.callTool({ name: toolName, arguments: args })
  return {
    content: 'content' in result ? (result.content as unknown[]) : [],
    isError: 'isError' in result ? Boolean(result.isError) : false,
  }
}

/**
 * Register all builtin servers as Passports with type='mcp'.
 * Call once at startup after PassportStore is initialized.
 * Idempotent — uses upsert via name matching.
 */
export async function registerBuiltinPassports(store: PassportStore): Promise<number> {
  ensureInitialized()
  const tools = await listBuiltinTools()
  let count = 0

  for (const server of tools) {
    const name = server.server_name
    try {
      // Check if passport already exists by listing with search
      const existing = await store.list({
        type: 'mcp',
        owner: 'system',
        search: name,
        per_page: 1,
      })

      const metadata = {
        transport: 'builtin',
        publisher_passport_id: 'system',
        verified: true,
        category: inferCategory(name),
        tools: server.tools.map(t => ({
          name: t.name,
          description: t.description ?? '',
        })),
      }

      if (existing.items.length > 0 && existing.items[0].name === name) {
        // Update existing passport
        await store.update(existing.items[0].passport_id, { metadata })
      } else {
        // Create new passport
        await store.create({
          type: 'mcp',
          owner: 'system',
          name,
          description: `Builtin MCP server: ${name}`,
          metadata,
          tags: ['builtin', inferCategory(name)],
        })
      }
      count++
    } catch {
      // Non-fatal — log and continue
    }
  }

  return count
}

/** Infer a category from the server name. */
function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (['github', 'gitlab', 'linear', 'jira', 'sentry'].some(k => n.includes(k))) return 'devtools'
  if (['slack', 'discord', 'telegram', 'teams'].some(k => n.includes(k))) return 'communication'
  if (['aave', 'compound', 'lido', 'uniswap', '1inch', 'jupiter', '0x'].some(k => n.includes(k))) return 'defi'
  if (['etherscan', 'solscan', 'alchemy', 'layerzero', 'wormhole'].some(k => n.includes(k))) return 'blockchain'
  if (['binance', 'coinbase', 'kraken', 'hyperliquid'].some(k => n.includes(k))) return 'trading'
  if (['coingecko', 'coinmarketcap', 'dexscreener', 'defillama', 'dune'].some(k => n.includes(k))) return 'market-data'
  if (['google', 'gmail', 'drive', 'sheets', 'docs', 'youtube'].some(k => n.includes(k))) return 'google'
  if (['stripe', 'shopify', 'hubspot', 'salesforce'].some(k => n.includes(k))) return 'business'
  if (['cloudflare', 'vercel', 'railway', 'datadog'].some(k => n.includes(k))) return 'devops'
  if (['polymarket', 'kalshi'].some(k => n.includes(k))) return 'prediction-markets'
  if (['notion', 'asana', 'trello', 'clickup', 'monday'].some(k => n.includes(k))) return 'productivity'
  return 'other'
}
