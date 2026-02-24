/**
 * Nansen MCP Server -- Production-ready
 *
 * Provides tools to query the Nansen analytics API for on-chain intelligence
 * including smart money tracking, token analytics, entity labels, wallet
 * profiling, exchange flows, and NFT trends.
 *
 * Tools:
 *   nansen_get_smart_money      -- Get smart money data for an address
 *   nansen_get_token_overview   -- Get token analytics overview
 *   nansen_get_entity           -- Get entity details for an address
 *   nansen_list_labels          -- List labels for an address
 *   nansen_get_token_holders    -- Get token holder analytics
 *   nansen_get_exchange_flows   -- Get exchange flow data
 *   nansen_get_nft_trends       -- Get NFT trending data
 *   nansen_get_wallet_profiler  -- Get wallet profiler data
 *   nansen_get_trending_tokens  -- Get currently trending tokens
 *   nansen_search               -- Search Nansen for addresses/entities
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'nansen',
  baseUrl: 'https://api.nansen.ai/v1',
  tokenEnvVar: 'NANSEN_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'x-api-key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'nansen-mcp',
  version: '0.1.0',
})

// ---- nansen_get_smart_money -----------------------------------------------

server.tool(
  'nansen_get_smart_money',
  'Get smart money signals and data for a wallet address. Shows if the address is identified as smart money, fund, or notable entity, along with their recent activity.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to look up smart money data for'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/smart-money/wallet/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_token_overview --------------------------------------------

server.tool(
  'nansen_get_token_overview',
  'Get a comprehensive analytics overview for a token by contract address. Returns holder composition, smart money holdings, inflow/outflow, and distribution metrics.',
  {
    address: z
      .string()
      .describe('Token contract address (0x...) to get analytics for'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/token/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_entity ----------------------------------------------------

server.tool(
  'nansen_get_entity',
  'Get entity information for a wallet address. Returns the entity name, type (exchange, fund, whale, etc.), and associated metadata.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to identify the entity for'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/entity/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_list_labels ---------------------------------------------------

server.tool(
  'nansen_list_labels',
  'List all Nansen labels assigned to a wallet address. Labels include categories like "Smart Money", "Exchange", "Fund", "Whale", and more.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get labels for'),
  },
  async ({ address }) => {
    try {
      const result = await call('/labels', {
        query: { address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_token_holders ---------------------------------------------

server.tool(
  'nansen_get_token_holders',
  'Get holder analytics for a token including top holders, smart money holders, holder distribution, and concentration metrics.',
  {
    address: z
      .string()
      .describe('Token contract address (0x...) to get holder data for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of top holders to return (default 25)'),
  },
  async ({ address, limit }) => {
    try {
      const result = await call(`/token/${encodeURIComponent(address)}/holders`, {
        query: {
          limit: String(limit ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_exchange_flows --------------------------------------------

server.tool(
  'nansen_get_exchange_flows',
  'Get exchange inflow and outflow data across major exchanges. Shows net flows, volume trends, and exchange-specific breakdowns.',
  {
    token: z
      .string()
      .optional()
      .describe('Token contract address to filter flows for (omit for aggregate data)'),
    exchange: z
      .string()
      .optional()
      .describe('Exchange name to filter by (e.g. "binance", "coinbase", "kraken")'),
    timeframe: z
      .enum(['1h', '4h', '24h', '7d', '30d'])
      .optional()
      .describe('Time window for flow data (default "24h")'),
  },
  async ({ token, exchange, timeframe }) => {
    try {
      const result = await call('/exchange/flows', {
        query: {
          token,
          exchange,
          timeframe: timeframe ?? '24h',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_nft_trends ------------------------------------------------

server.tool(
  'nansen_get_nft_trends',
  'Get NFT trending data from Nansen including hot collections, smart money NFT activity, and volume trends.',
  {
    timeframe: z
      .enum(['1h', '6h', '24h', '7d', '30d'])
      .optional()
      .describe('Time window for trending data (default "24h")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of trending collections to return (default 25)'),
  },
  async ({ timeframe, limit }) => {
    try {
      const result = await call('/nft/trends', {
        query: {
          timeframe: timeframe ?? '24h',
          limit: String(limit ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_wallet_profiler -------------------------------------------

server.tool(
  'nansen_get_wallet_profiler',
  'Get detailed wallet profiler data for an address. Returns portfolio composition, trading history, PnL metrics, and activity patterns.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to profile'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/wallet/${encodeURIComponent(address)}/profiler`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_get_trending_tokens -------------------------------------------

server.tool(
  'nansen_get_trending_tokens',
  'Get currently trending tokens on Nansen based on smart money activity, volume spikes, and holder growth.',
  {
    timeframe: z
      .enum(['1h', '6h', '24h', '7d'])
      .optional()
      .describe('Time window for trending data (default "24h")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of trending tokens to return (default 25)'),
  },
  async ({ timeframe, limit }) => {
    try {
      const result = await call('/token/trending', {
        query: {
          timeframe: timeframe ?? '24h',
          limit: String(limit ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- nansen_search --------------------------------------------------------

server.tool(
  'nansen_search',
  'Search Nansen for addresses, entities, tokens, or labels by keyword. Returns matching results with their types and metadata.',
  {
    query: z
      .string()
      .describe('Search query string (address, name, or keyword)'),
  },
  async ({ query: searchQuery }) => {
    try {
      const result = await call('/search', {
        query: { q: searchQuery },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
