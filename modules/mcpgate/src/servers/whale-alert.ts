/**
 * Whale Alert MCP Server -- Production-ready
 *
 * Provides tools to interact with the Whale Alert API for tracking
 * large cryptocurrency transactions across multiple blockchains.
 *
 * API: https://api.whale-alert.io/v1
 * Auth: api-key-query with 'api_key'
 * Token env var: WHALE_ALERT_API_KEY
 *
 * Tools:
 *   whale_get_transactions   -- Get transactions with filters
 *   whale_get_status         -- Get Whale Alert API status
 *   whale_get_transaction    -- Get a specific transaction by hash
 *   whale_list_blockchains   -- List supported blockchains
 *   whale_get_recent         -- Get recent transactions (last hour)
 *   whale_get_by_blockchain  -- Get transactions filtered by blockchain
 *   whale_get_by_currency    -- Get transactions filtered by currency
 *   whale_search             -- Search transactions with multiple filters
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'whale-alert',
  baseUrl: 'https://api.whale-alert.io/v1',
  tokenEnvVar: 'WHALE_ALERT_API_KEY',
  authStyle: 'api-key-query',
  authHeader: 'api_key',
})

// ---------------------------------------------------------------------------
// Supported blockchains (hardcoded list)
// ---------------------------------------------------------------------------

const SUPPORTED_BLOCKCHAINS = [
  'bitcoin', 'ethereum', 'ripple', 'neo', 'eos', 'stellar', 'tron',
  'binancechain', 'icon', 'aeternity', 'steem', 'hive',
] as const

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'whale-alert-mcp',
  version: '0.1.0',
})

// ---- whale_get_transactions ------------------------------------------------

server.tool(
  'whale_get_transactions',
  'Get large cryptocurrency transactions from Whale Alert with configurable minimum value and time range.',
  {
    min_value: z.number().optional().describe('Minimum transaction value in USD (default 500000)'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    end: z.number().optional().describe('End time as Unix timestamp in seconds'),
    cursor: z.string().optional().describe('Cursor for pagination (from previous response)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of transactions to return (1-100, default 100)'),
  },
  async ({ min_value, start, end, cursor, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (min_value !== undefined) query.min_value = String(min_value)
      if (start !== undefined) query.start = String(start)
      if (end !== undefined) query.end = String(end)
      if (cursor !== undefined) query.cursor = cursor
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_get_status ------------------------------------------------------

server.tool(
  'whale_get_status',
  'Get the current status of the Whale Alert API including blockchain tracking status and API version.',
  {},
  async () => {
    try {
      const result = await call('/status')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_get_transaction -------------------------------------------------

server.tool(
  'whale_get_transaction',
  'Get details for a specific transaction by its hash and blockchain.',
  {
    hash: z.string().describe('Transaction hash to look up'),
    blockchain: z.string().describe('Blockchain the transaction is on (e.g. "bitcoin", "ethereum", "ripple")'),
  },
  async ({ hash, blockchain }) => {
    try {
      const result = await call(
        `/transaction/${encodeURIComponent(blockchain)}/${encodeURIComponent(hash)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_list_blockchains ------------------------------------------------

server.tool(
  'whale_list_blockchains',
  'List all blockchains supported by Whale Alert for transaction tracking.',
  {},
  async () => {
    try {
      return successContent({
        blockchains: SUPPORTED_BLOCKCHAINS,
        count: SUPPORTED_BLOCKCHAINS.length,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_get_recent ------------------------------------------------------

server.tool(
  'whale_get_recent',
  'Get recent large cryptocurrency transactions from the last hour.',
  {
    min_value: z.number().optional().describe('Minimum transaction value in USD (default 500000)'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of transactions to return (1-100)'),
  },
  async ({ min_value, limit }) => {
    try {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const query: Record<string, string | undefined> = {
        start: String(oneHourAgo),
      }
      if (min_value !== undefined) query.min_value = String(min_value)
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_get_by_blockchain -----------------------------------------------

server.tool(
  'whale_get_by_blockchain',
  'Get large cryptocurrency transactions filtered by a specific blockchain.',
  {
    blockchain: z.string().describe('Blockchain to filter by (e.g. "bitcoin", "ethereum", "ripple", "tron")'),
    min_value: z.number().optional().describe('Minimum transaction value in USD (default 500000)'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    end: z.number().optional().describe('End time as Unix timestamp in seconds'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of transactions to return (1-100)'),
  },
  async ({ blockchain, min_value, start, end, limit }) => {
    try {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const query: Record<string, string | undefined> = {
        blockchain,
        start: start !== undefined ? String(start) : String(oneHourAgo),
      }
      if (min_value !== undefined) query.min_value = String(min_value)
      if (end !== undefined) query.end = String(end)
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_get_by_currency -------------------------------------------------

server.tool(
  'whale_get_by_currency',
  'Get large cryptocurrency transactions filtered by a specific currency.',
  {
    currency: z.string().describe('Currency symbol to filter by (e.g. "btc", "eth", "usdt", "xrp")'),
    min_value: z.number().optional().describe('Minimum transaction value in USD (default 500000)'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    end: z.number().optional().describe('End time as Unix timestamp in seconds'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of transactions to return (1-100)'),
  },
  async ({ currency, min_value, start, end, limit }) => {
    try {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const query: Record<string, string | undefined> = {
        currency: currency.toLowerCase(),
        start: start !== undefined ? String(start) : String(oneHourAgo),
      }
      if (min_value !== undefined) query.min_value = String(min_value)
      if (end !== undefined) query.end = String(end)
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- whale_search ----------------------------------------------------------

server.tool(
  'whale_search',
  'Search large cryptocurrency transactions with multiple combined filters including blockchain, currency, value, and time range.',
  {
    blockchain: z.string().optional().describe('Filter by blockchain (e.g. "bitcoin", "ethereum")'),
    currency: z.string().optional().describe('Filter by currency symbol (e.g. "btc", "eth", "usdt")'),
    min_value: z.number().optional().describe('Minimum transaction value in USD'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    end: z.number().optional().describe('End time as Unix timestamp in seconds'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of transactions to return (1-100)'),
    cursor: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ blockchain, currency, min_value, start, end, limit, cursor }) => {
    try {
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const query: Record<string, string | undefined> = {
        start: start !== undefined ? String(start) : String(oneHourAgo),
      }
      if (blockchain !== undefined) query.blockchain = blockchain
      if (currency !== undefined) query.currency = currency.toLowerCase()
      if (min_value !== undefined) query.min_value = String(min_value)
      if (end !== undefined) query.end = String(end)
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      const result = await call('/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
