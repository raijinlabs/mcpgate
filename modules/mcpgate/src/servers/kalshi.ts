/**
 * Kalshi MCP Server -- Production-ready
 *
 * Provides tools to interact with the Kalshi event contracts platform.
 * API: https://trading-api.kalshi.com/trade-api/v2 (production)
 *      https://demo-api.kalshi.co/trade-api/v2 (demo -- set KALSHI_DEMO=true)
 * Auth: Bearer token via KALSHI_TOKEN
 *
 * Tools:
 *   kalshi_list_events          -- List events with optional filters
 *   kalshi_get_event            -- Get a specific event by ticker
 *   kalshi_list_markets         -- List markets with optional filters
 *   kalshi_get_market           -- Get a specific market by ticker
 *   kalshi_get_orderbook        -- Get orderbook for a market
 *   kalshi_get_trades           -- Get trades for a market
 *   kalshi_create_order         -- Create a new order
 *   kalshi_cancel_order         -- Cancel an existing order
 *   kalshi_get_positions        -- Get portfolio positions
 *   kalshi_get_balance          -- Get portfolio balance
 *   kalshi_get_fills            -- Get portfolio fills
 *   kalshi_get_portfolio_history -- Get portfolio history
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client -- switch between prod and demo based on KALSHI_DEMO env
// ---------------------------------------------------------------------------

const isDemo = process.env.KALSHI_DEMO === 'true'
const baseUrl = isDemo
  ? 'https://demo-api.kalshi.co/trade-api/v2'
  : 'https://trading-api.kalshi.com/trade-api/v2'

const { call, categoriseError } = createApiClient({
  name: 'kalshi',
  baseUrl,
  tokenEnvVar: 'KALSHI_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'kalshi-mcp',
  version: '0.1.0',
})

// ---- kalshi_list_events ----------------------------------------------------

server.tool(
  'kalshi_list_events',
  'List events on Kalshi with optional filters. Events contain one or more markets.',
  {
    limit: z.number().int().optional().describe('Maximum number of events to return (default 100)'),
    cursor: z.string().optional().describe('Cursor for pagination'),
    status: z.string().optional().describe('Filter by event status (e.g. "open", "closed")'),
    series_ticker: z.string().optional().describe('Filter by event series ticker'),
    with_nested_markets: z.boolean().optional().describe('Include nested market data in response'),
  },
  async ({ limit, cursor, status, series_ticker, with_nested_markets }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      if (status !== undefined) query.status = status
      if (series_ticker !== undefined) query.series_ticker = series_ticker
      if (with_nested_markets !== undefined) query.with_nested_markets = String(with_nested_markets)
      const result = await call('/events', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_event ------------------------------------------------------

server.tool(
  'kalshi_get_event',
  'Get detailed information about a specific Kalshi event by its event ticker.',
  {
    event_ticker: z.string().describe('Event ticker (e.g. "KXBTC-24DEC31")'),
    with_nested_markets: z.boolean().optional().describe('Include nested market data in response'),
  },
  async ({ event_ticker, with_nested_markets }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (with_nested_markets !== undefined) query.with_nested_markets = String(with_nested_markets)
      const result = await call(`/events/${encodeURIComponent(event_ticker)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_list_markets ---------------------------------------------------

server.tool(
  'kalshi_list_markets',
  'List markets on Kalshi with optional filters. Each market represents a specific yes/no question.',
  {
    limit: z.number().int().optional().describe('Maximum number of markets to return (default 100)'),
    cursor: z.string().optional().describe('Cursor for pagination'),
    event_ticker: z.string().optional().describe('Filter by parent event ticker'),
    series_ticker: z.string().optional().describe('Filter by series ticker'),
    status: z.string().optional().describe('Filter by market status (e.g. "open", "closed", "settled")'),
    tickers: z.string().optional().describe('Comma-separated list of market tickers to fetch'),
  },
  async ({ limit, cursor, event_ticker, series_ticker, status, tickers }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      if (event_ticker !== undefined) query.event_ticker = event_ticker
      if (series_ticker !== undefined) query.series_ticker = series_ticker
      if (status !== undefined) query.status = status
      if (tickers !== undefined) query.tickers = tickers
      const result = await call('/markets', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_market -----------------------------------------------------

server.tool(
  'kalshi_get_market',
  'Get detailed information about a specific Kalshi market by its ticker.',
  {
    ticker: z.string().describe('Market ticker (e.g. "KXBTC-24DEC31-T100000")'),
  },
  async ({ ticker }) => {
    try {
      const result = await call(`/markets/${encodeURIComponent(ticker)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_orderbook --------------------------------------------------

server.tool(
  'kalshi_get_orderbook',
  'Get the orderbook (bids and asks) for a specific Kalshi market.',
  {
    ticker: z.string().describe('Market ticker to get orderbook for'),
    depth: z.number().int().optional().describe('Orderbook depth (number of price levels)'),
  },
  async ({ ticker, depth }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (depth !== undefined) query.depth = String(depth)
      const result = await call(`/markets/${encodeURIComponent(ticker)}/orderbook`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_trades -----------------------------------------------------

server.tool(
  'kalshi_get_trades',
  'Get recent trades for a specific Kalshi market.',
  {
    ticker: z.string().describe('Market ticker to get trades for'),
    limit: z.number().int().optional().describe('Maximum number of trades to return'),
    cursor: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ ticker, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      const result = await call(`/markets/${encodeURIComponent(ticker)}/trades`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_create_order ---------------------------------------------------

server.tool(
  'kalshi_create_order',
  'Create a new order on a Kalshi market. Requires authentication. Returns order details.',
  {
    ticker: z.string().describe('Market ticker to place order on'),
    action: z.enum(['buy', 'sell']).describe('Order action: "buy" or "sell"'),
    side: z.enum(['yes', 'no']).describe('Side of the contract: "yes" or "no"'),
    type: z.enum(['market', 'limit']).describe('Order type: "market" or "limit"'),
    count: z.number().int().min(1).describe('Number of contracts to buy/sell'),
    yes_price: z.number().int().optional().describe('Limit price in cents for yes contracts (1-99)'),
    no_price: z.number().int().optional().describe('Limit price in cents for no contracts (1-99)'),
    expiration_ts: z.number().optional().describe('Order expiration as Unix timestamp (seconds). Omit for GTC.'),
    sell_position_floor: z.number().int().optional().describe('Minimum position to maintain when selling'),
    buy_max_cost: z.number().int().optional().describe('Maximum total cost in cents for the order'),
  },
  async ({ ticker, action, side, type, count, yes_price, no_price, expiration_ts, sell_position_floor, buy_max_cost }) => {
    try {
      const body: Record<string, unknown> = {
        ticker,
        action,
        side,
        type,
        count,
      }
      if (yes_price !== undefined) body.yes_price = yes_price
      if (no_price !== undefined) body.no_price = no_price
      if (expiration_ts !== undefined) body.expiration_ts = expiration_ts
      if (sell_position_floor !== undefined) body.sell_position_floor = sell_position_floor
      if (buy_max_cost !== undefined) body.buy_max_cost = buy_max_cost
      const result = await call('/portfolio/orders', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_cancel_order ---------------------------------------------------

server.tool(
  'kalshi_cancel_order',
  'Cancel an existing order on Kalshi by its order ID.',
  {
    order_id: z.string().describe('Order ID to cancel'),
  },
  async ({ order_id }) => {
    try {
      const result = await call(`/portfolio/orders/${encodeURIComponent(order_id)}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_positions --------------------------------------------------

server.tool(
  'kalshi_get_positions',
  'Get all current portfolio positions on Kalshi. Requires authentication.',
  {
    limit: z.number().int().optional().describe('Maximum number of positions to return'),
    cursor: z.string().optional().describe('Cursor for pagination'),
    settlement_status: z.string().optional().describe('Filter by settlement status (e.g. "unsettled", "settled")'),
    ticker: z.string().optional().describe('Filter by market ticker'),
    event_ticker: z.string().optional().describe('Filter by event ticker'),
  },
  async ({ limit, cursor, settlement_status, ticker, event_ticker }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      if (settlement_status !== undefined) query.settlement_status = settlement_status
      if (ticker !== undefined) query.ticker = ticker
      if (event_ticker !== undefined) query.event_ticker = event_ticker
      const result = await call('/portfolio/positions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_balance ----------------------------------------------------

server.tool(
  'kalshi_get_balance',
  'Get the current portfolio balance on Kalshi including available and total balance. Requires authentication.',
  {},
  async () => {
    try {
      const result = await call('/portfolio/balance')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_fills ------------------------------------------------------

server.tool(
  'kalshi_get_fills',
  'Get portfolio fill history on Kalshi. Shows completed trades. Requires authentication.',
  {
    limit: z.number().int().optional().describe('Maximum number of fills to return'),
    cursor: z.string().optional().describe('Cursor for pagination'),
    ticker: z.string().optional().describe('Filter by market ticker'),
    order_id: z.string().optional().describe('Filter by order ID'),
  },
  async ({ limit, cursor, ticker, order_id }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor
      if (ticker !== undefined) query.ticker = ticker
      if (order_id !== undefined) query.order_id = order_id
      const result = await call('/portfolio/fills', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kalshi_get_portfolio_history ------------------------------------------

server.tool(
  'kalshi_get_portfolio_history',
  'Get portfolio value history over time on Kalshi. Requires authentication.',
  {
    cursor: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (cursor !== undefined) query.cursor = cursor
      const result = await call('/portfolio/history', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
