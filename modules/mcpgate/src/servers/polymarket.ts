/**
 * Polymarket MCP Server -- Production-ready
 *
 * Provides tools to interact with Polymarket prediction markets.
 * Two APIs are used:
 *   - Gamma (market discovery, no auth): https://gamma-api.polymarket.com
 *   - CLOB (trading data, auth via POLY-API-KEY header): https://clob.polymarket.com
 *
 * Tools:
 *   polymarket_list_markets        -- List markets from Gamma API
 *   polymarket_get_market          -- Get a specific market by ID
 *   polymarket_search_markets      -- Search markets by query string
 *   polymarket_get_events          -- List events from Gamma API
 *   polymarket_get_event           -- Get a specific event by ID
 *   polymarket_get_orderbook       -- Get CLOB orderbook for a token
 *   polymarket_get_prices          -- Get CLOB prices for token(s)
 *   polymarket_get_trades          -- Get CLOB trades for a market
 *   polymarket_get_midpoint        -- Get CLOB midpoint price for a token
 *   polymarket_get_spread          -- Get CLOB spread for a token
 *   polymarket_list_markets_clob   -- List markets from CLOB
 *   polymarket_get_last_trade_price -- Get last trade price for a token
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Clients
// ---------------------------------------------------------------------------

// Gamma API -- public, no auth
const gamma = createApiClient({
  name: 'polymarket-gamma',
  baseUrl: 'https://gamma-api.polymarket.com',
  tokenEnvVar: 'POLYMARKET_API_KEY',
  authStyle: 'none',
})

// CLOB API -- requires POLY-API-KEY header
const clob = createApiClient({
  name: 'polymarket-clob',
  baseUrl: 'https://clob.polymarket.com',
  tokenEnvVar: 'POLYMARKET_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'POLY-API-KEY',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'polymarket-mcp',
  version: '0.1.0',
})

// ---- polymarket_list_markets -----------------------------------------------

server.tool(
  'polymarket_list_markets',
  'List prediction markets from Polymarket Gamma API. Returns market metadata, outcomes, and current prices.',
  {
    limit: z.number().int().optional().describe('Maximum number of markets to return'),
    offset: z.number().int().optional().describe('Offset for pagination'),
    closed: z.boolean().optional().describe('Filter by closed status'),
    active: z.boolean().optional().describe('Filter by active status'),
  },
  async ({ limit, offset, closed, active }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      if (closed !== undefined) query.closed = String(closed)
      if (active !== undefined) query.active = String(active)
      const result = await gamma.call('/markets', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, gamma.categoriseError)
    }
  },
)

// ---- polymarket_get_market -------------------------------------------------

server.tool(
  'polymarket_get_market',
  'Get detailed information about a specific Polymarket prediction market by its ID.',
  {
    id: z.string().describe('Polymarket market ID (condition_id or slug)'),
  },
  async ({ id }) => {
    try {
      const result = await gamma.call(`/markets/${encodeURIComponent(id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, gamma.categoriseError)
    }
  },
)

// ---- polymarket_search_markets ---------------------------------------------

server.tool(
  'polymarket_search_markets',
  'Search Polymarket prediction markets by query string. Returns matching markets with metadata and prices.',
  {
    query: z.string().describe('Search query (e.g. "presidential election", "bitcoin price")'),
    limit: z.number().int().optional().describe('Maximum number of results to return'),
    offset: z.number().int().optional().describe('Offset for pagination'),
  },
  async ({ query, limit, offset }) => {
    try {
      const q: Record<string, string | undefined> = { query }
      if (limit !== undefined) q.limit = String(limit)
      if (offset !== undefined) q.offset = String(offset)
      const result = await gamma.call('/markets', { query: q })
      return successContent(result)
    } catch (err) {
      return errorContent(err, gamma.categoriseError)
    }
  },
)

// ---- polymarket_get_events -------------------------------------------------

server.tool(
  'polymarket_get_events',
  'List events from the Polymarket Gamma API. Events group related markets together.',
  {
    limit: z.number().int().optional().describe('Maximum number of events to return'),
    offset: z.number().int().optional().describe('Offset for pagination'),
    closed: z.boolean().optional().describe('Filter by closed status'),
    active: z.boolean().optional().describe('Filter by active status'),
  },
  async ({ limit, offset, closed, active }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      if (closed !== undefined) query.closed = String(closed)
      if (active !== undefined) query.active = String(active)
      const result = await gamma.call('/events', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, gamma.categoriseError)
    }
  },
)

// ---- polymarket_get_event --------------------------------------------------

server.tool(
  'polymarket_get_event',
  'Get detailed information about a specific Polymarket event by its ID, including all associated markets.',
  {
    id: z.string().describe('Polymarket event ID'),
  },
  async ({ id }) => {
    try {
      const result = await gamma.call(`/events/${encodeURIComponent(id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, gamma.categoriseError)
    }
  },
)

// ---- polymarket_get_orderbook ----------------------------------------------

server.tool(
  'polymarket_get_orderbook',
  'Get the CLOB orderbook (bids and asks) for a specific token on Polymarket.',
  {
    token_id: z.string().describe('CLOB token ID (condition_id + outcome_index)'),
  },
  async ({ token_id }) => {
    try {
      const result = await clob.call('/book', {
        query: { token_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_get_prices -------------------------------------------------

server.tool(
  'polymarket_get_prices',
  'Get current prices for one or more tokens from the Polymarket CLOB.',
  {
    token_ids: z.string().describe('Comma-separated CLOB token IDs to get prices for'),
  },
  async ({ token_ids }) => {
    try {
      const result = await clob.call('/prices', {
        query: { token_ids },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_get_trades -------------------------------------------------

server.tool(
  'polymarket_get_trades',
  'Get recent trades for a specific market from the Polymarket CLOB.',
  {
    market: z.string().describe('Market condition ID to get trades for'),
    limit: z.number().int().optional().describe('Maximum number of trades to return'),
    before: z.string().optional().describe('Cursor for pagination (trade ID to fetch before)'),
  },
  async ({ market, limit, before }) => {
    try {
      const query: Record<string, string | undefined> = { market }
      if (limit !== undefined) query.limit = String(limit)
      if (before !== undefined) query.before = before
      const result = await clob.call('/trades', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_get_midpoint -----------------------------------------------

server.tool(
  'polymarket_get_midpoint',
  'Get the midpoint price for a specific token from the Polymarket CLOB orderbook.',
  {
    token_id: z.string().describe('CLOB token ID to get midpoint price for'),
  },
  async ({ token_id }) => {
    try {
      const result = await clob.call('/midpoint', {
        query: { token_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_get_spread -------------------------------------------------

server.tool(
  'polymarket_get_spread',
  'Get the bid-ask spread for a specific token from the Polymarket CLOB orderbook.',
  {
    token_id: z.string().describe('CLOB token ID to get spread for'),
  },
  async ({ token_id }) => {
    try {
      const result = await clob.call('/spread', {
        query: { token_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_list_markets_clob ------------------------------------------

server.tool(
  'polymarket_list_markets_clob',
  'List markets from the Polymarket CLOB with trading data including volume and liquidity metrics.',
  {
    next_cursor: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ next_cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (next_cursor !== undefined) query.next_cursor = next_cursor
      const result = await clob.call('/markets', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

// ---- polymarket_get_last_trade_price ---------------------------------------

server.tool(
  'polymarket_get_last_trade_price',
  'Get the last trade price for a specific token from the Polymarket CLOB.',
  {
    token_id: z.string().describe('CLOB token ID to get last trade price for'),
  },
  async ({ token_id }) => {
    try {
      const result = await clob.call('/last-trade-price', {
        query: { token_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, clob.categoriseError)
    }
  },
)

export default server
