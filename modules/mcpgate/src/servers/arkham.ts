/**
 * Arkham Intelligence MCP Server -- Production-ready
 *
 * Provides tools to query the Arkham Intelligence API for on-chain analytics,
 * entity identification, transfer tracking, portfolio analysis, and exchange
 * flow monitoring across multiple blockchains.
 *
 * Tools:
 *   arkham_get_address         -- Get intelligence data for an address
 *   arkham_search_entities     -- Search for entities by keyword
 *   arkham_get_entity          -- Get entity details by ID
 *   arkham_get_transfers       -- Get transfers for an address
 *   arkham_get_portfolio       -- Get portfolio breakdown for an address
 *   arkham_get_token_flows     -- Get token flow data
 *   arkham_list_alerts         -- List configured alerts
 *   arkham_get_historical_balance -- Get historical balance for an address
 *   arkham_get_chain_activity  -- Get activity data for a chain
 *   arkham_get_exchange_flows  -- Get exchange inflow/outflow data
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'arkham',
  baseUrl: 'https://api.arkhamintelligence.com',
  tokenEnvVar: 'ARKHAM_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'API-Key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'arkham-mcp',
  version: '0.1.0',
})

// ---- arkham_get_address ---------------------------------------------------

server.tool(
  'arkham_get_address',
  'Get Arkham Intelligence data for a blockchain address. Returns entity identification, labels, tags, portfolio summary, and risk indicators.',
  {
    address: z
      .string()
      .describe('Blockchain address (0x...) to look up intelligence data for'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/intelligence/address/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_search_entities -----------------------------------------------

server.tool(
  'arkham_search_entities',
  'Search Arkham Intelligence for entities, addresses, and labels by keyword. Returns matching entities with their metadata and associated addresses.',
  {
    query: z
      .string()
      .describe('Search keyword (entity name, address, or label)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (default 20)'),
  },
  async ({ query: searchQuery, limit }) => {
    try {
      const result = await call('/intelligence/search', {
        query: {
          query: searchQuery,
          limit: String(limit ?? 20),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_entity ----------------------------------------------------

server.tool(
  'arkham_get_entity',
  'Get detailed entity information by Arkham entity ID. Returns the entity name, type, associated addresses, portfolio, and activity summary.',
  {
    entity_id: z
      .string()
      .describe('Arkham entity ID to look up'),
  },
  async ({ entity_id }) => {
    try {
      const result = await call(`/intelligence/entity/${encodeURIComponent(entity_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_transfers -------------------------------------------------

server.tool(
  'arkham_get_transfers',
  'Get token transfers for a blockchain address. Returns transfer history with amounts, counterparties, and entity labels.',
  {
    address: z
      .string()
      .describe('Blockchain address (0x...) to get transfers for'),
    chain: z
      .string()
      .optional()
      .describe('Filter by chain (e.g. "ethereum", "bitcoin", "polygon", "arbitrum")'),
    token: z
      .string()
      .optional()
      .describe('Filter by token contract address'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of transfers to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    time_from: z
      .string()
      .optional()
      .describe('Start time filter in ISO 8601 format'),
    time_to: z
      .string()
      .optional()
      .describe('End time filter in ISO 8601 format'),
  },
  async ({ address, chain, token, limit, offset, time_from, time_to }) => {
    try {
      const result = await call('/transfers', {
        query: {
          address,
          chain,
          token,
          limit: String(limit ?? 50),
          offset: String(offset ?? 0),
          time_from,
          time_to,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_portfolio -------------------------------------------------

server.tool(
  'arkham_get_portfolio',
  'Get portfolio breakdown for a blockchain address. Returns token holdings, values, and allocation percentages.',
  {
    address: z
      .string()
      .describe('Blockchain address (0x...) to get portfolio for'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/portfolio/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_token_flows -----------------------------------------------

server.tool(
  'arkham_get_token_flows',
  'Get flow data for a specific token including major senders, receivers, and volume over time.',
  {
    address: z
      .string()
      .describe('Token contract address (0x...) to get flow data for'),
    timeframe: z
      .enum(['1h', '4h', '24h', '7d', '30d'])
      .optional()
      .describe('Time window for flow data (default "24h")'),
    chain: z
      .string()
      .optional()
      .describe('Blockchain network (e.g. "ethereum", "polygon")'),
  },
  async ({ address, timeframe, chain }) => {
    try {
      const result = await call(`/token/${encodeURIComponent(address)}/flows`, {
        query: {
          timeframe: timeframe ?? '24h',
          chain,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_list_alerts ---------------------------------------------------

server.tool(
  'arkham_list_alerts',
  'List all configured alerts on Arkham Intelligence. Returns alert rules, conditions, and notification settings.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of alerts to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ limit, offset }) => {
    try {
      const result = await call('/alerts', {
        query: {
          limit: String(limit ?? 50),
          offset: String(offset ?? 0),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_historical_balance ----------------------------------------

server.tool(
  'arkham_get_historical_balance',
  'Get historical balance snapshots for an address over time. Shows how the portfolio value changed across different time periods.',
  {
    address: z
      .string()
      .describe('Blockchain address (0x...) to get historical balance for'),
    timeframe: z
      .enum(['7d', '30d', '90d', '1y', 'all'])
      .optional()
      .describe('Time range for historical data (default "30d")'),
  },
  async ({ address, timeframe }) => {
    try {
      const result = await call(
        `/intelligence/address/${encodeURIComponent(address)}/history`,
        {
          query: {
            timeframe: timeframe ?? '30d',
          },
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_chain_activity --------------------------------------------

server.tool(
  'arkham_get_chain_activity',
  'Get on-chain activity metrics for a specific blockchain. Returns transaction counts, active addresses, volume, and gas usage trends.',
  {
    chain: z
      .string()
      .describe('Blockchain network (e.g. "ethereum", "bitcoin", "polygon", "arbitrum", "solana")'),
    timeframe: z
      .enum(['1h', '4h', '24h', '7d', '30d'])
      .optional()
      .describe('Time window for activity data (default "24h")'),
  },
  async ({ chain, timeframe }) => {
    try {
      const result = await call('/activity', {
        query: {
          chain,
          timeframe: timeframe ?? '24h',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- arkham_get_exchange_flows --------------------------------------------

server.tool(
  'arkham_get_exchange_flows',
  'Get exchange inflow and outflow data from Arkham Intelligence. Shows net flows, volume breakdowns, and exchange-specific metrics.',
  {
    exchange: z
      .string()
      .optional()
      .describe('Exchange name to filter by (e.g. "binance", "coinbase", "kraken")'),
    token: z
      .string()
      .optional()
      .describe('Token contract address to filter flows for'),
    timeframe: z
      .enum(['1h', '4h', '24h', '7d', '30d'])
      .optional()
      .describe('Time window for flow data (default "24h")'),
  },
  async ({ exchange, token, timeframe }) => {
    try {
      const result = await call('/exchange/flows', {
        query: {
          exchange,
          token,
          timeframe: timeframe ?? '24h',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
