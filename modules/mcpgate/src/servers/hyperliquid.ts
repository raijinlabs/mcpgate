/**
 * Hyperliquid MCP Server -- Production-ready
 *
 * Provides tools to interact with the Hyperliquid perpetual DEX.
 * All public read operations are POST requests to /info with a JSON body
 * containing a "type" field.  Write operations require wallet signatures
 * (not implemented here -- read-only for now).
 *
 * API: https://api.hyperliquid.xyz
 * Auth: NONE for reads (POST /info), wallet signature for writes (POST /exchange)
 *
 * Tools:
 *   hyperliquid_get_meta                        -- Get exchange metadata (assets, universe)
 *   hyperliquid_get_all_mids                    -- Get all mid prices
 *   hyperliquid_get_orderbook                   -- Get L2 orderbook for a coin
 *   hyperliquid_get_user_state                  -- Get clearinghouse state for a user
 *   hyperliquid_get_open_orders                 -- Get open orders for a user
 *   hyperliquid_get_user_fills                  -- Get fill history for a user
 *   hyperliquid_get_funding_history             -- Get funding rate history for a coin
 *   hyperliquid_get_candles                     -- Get candlestick data
 *   hyperliquid_get_user_funding                -- Get funding payments for a user
 *   hyperliquid_get_frontend_open_orders        -- Get frontend open orders
 *   hyperliquid_get_spot_meta                   -- Get spot exchange metadata
 *   hyperliquid_get_spot_clearinghouse          -- Get spot clearinghouse state
 *   hyperliquid_get_perpetuals_meta_and_asset_ctxs -- Get perps metadata and asset contexts
 *   hyperliquid_get_clearinghouse_state         -- Get clearinghouse state (private, read-only)
 *   hyperliquid_get_user_rate_limits            -- Get rate limits for a user (private, read-only)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Custom POST helper -- Hyperliquid uses POST /info for all public reads
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.hyperliquid.xyz'

function categoriseError(err: unknown): { message: string; hint: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
    return { message, hint: 'Rate limit hit. Reduce request frequency.' }
  }
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return { message, hint: 'Hyperliquid is experiencing issues. Please try again shortly.' }
  }
  return { message, hint: '' }
}

async function infoCall(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hyperliquid API error (${res.status}): ${text}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'hyperliquid-mcp',
  version: '0.1.0',
})

// ---- hyperliquid_get_meta --------------------------------------------------

server.tool(
  'hyperliquid_get_meta',
  'Get Hyperliquid exchange metadata including asset universe, listing details, and margin parameters.',
  {},
  async () => {
    try {
      const result = await infoCall({ type: 'meta' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_all_mids ----------------------------------------------

server.tool(
  'hyperliquid_get_all_mids',
  'Get all current mid prices for every listed asset on Hyperliquid.',
  {},
  async () => {
    try {
      const result = await infoCall({ type: 'allMids' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_orderbook ---------------------------------------------

server.tool(
  'hyperliquid_get_orderbook',
  'Get the L2 orderbook (bids and asks) for a specific coin on Hyperliquid.',
  {
    coin: z.string().describe('Coin symbol (e.g. "BTC", "ETH", "SOL")'),
  },
  async ({ coin }) => {
    try {
      const result = await infoCall({ type: 'l2Book', coin })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_user_state --------------------------------------------

server.tool(
  'hyperliquid_get_user_state',
  'Get the clearinghouse state for a specific user on Hyperliquid, including positions, margin, and account value.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'clearinghouseState', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_open_orders -------------------------------------------

server.tool(
  'hyperliquid_get_open_orders',
  'Get all open orders for a specific user on Hyperliquid.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'openOrders', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_user_fills --------------------------------------------

server.tool(
  'hyperliquid_get_user_fills',
  'Get trade fill history for a specific user on Hyperliquid.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'userFills', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_funding_history ---------------------------------------

server.tool(
  'hyperliquid_get_funding_history',
  'Get the funding rate history for a specific coin on Hyperliquid.',
  {
    coin: z.string().describe('Coin symbol (e.g. "BTC", "ETH")'),
    startTime: z.number().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().optional().describe('End time as Unix timestamp in milliseconds'),
  },
  async ({ coin, startTime, endTime }) => {
    try {
      const body: Record<string, unknown> = { type: 'fundingHistory', coin }
      if (startTime !== undefined) body.startTime = startTime
      if (endTime !== undefined) body.endTime = endTime
      const result = await infoCall(body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_candles -----------------------------------------------

server.tool(
  'hyperliquid_get_candles',
  'Get candlestick (OHLCV) data for a specific coin on Hyperliquid.',
  {
    coin: z.string().describe('Coin symbol (e.g. "BTC", "ETH")'),
    interval: z.string().describe('Candle interval (e.g. "1m", "5m", "15m", "1h", "4h", "1d")'),
    startTime: z.number().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().optional().describe('End time as Unix timestamp in milliseconds'),
  },
  async ({ coin, interval, startTime, endTime }) => {
    try {
      const body: Record<string, unknown> = {
        type: 'candleSnapshot',
        req: { coin, interval, startTime },
      }
      if (endTime !== undefined) (body.req as Record<string, unknown>).endTime = endTime
      const result = await infoCall(body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_user_funding ------------------------------------------

server.tool(
  'hyperliquid_get_user_funding',
  'Get funding payments history for a specific user on Hyperliquid.',
  {
    user: z.string().describe('User wallet address (0x...)'),
    startTime: z.number().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().optional().describe('End time as Unix timestamp in milliseconds'),
  },
  async ({ user, startTime, endTime }) => {
    try {
      const body: Record<string, unknown> = { type: 'userFunding', user }
      if (startTime !== undefined) body.startTime = startTime
      if (endTime !== undefined) body.endTime = endTime
      const result = await infoCall(body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_frontend_open_orders ----------------------------------

server.tool(
  'hyperliquid_get_frontend_open_orders',
  'Get frontend-formatted open orders for a specific user on Hyperliquid, including additional display metadata.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'frontendOpenOrders', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_spot_meta ---------------------------------------------

server.tool(
  'hyperliquid_get_spot_meta',
  'Get Hyperliquid spot exchange metadata including supported spot tokens and trading pairs.',
  {},
  async () => {
    try {
      const result = await infoCall({ type: 'spotMeta' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_spot_clearinghouse ------------------------------------

server.tool(
  'hyperliquid_get_spot_clearinghouse',
  'Get the spot clearinghouse state for a specific user on Hyperliquid, including spot balances.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'spotClearinghouseState', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_perpetuals_meta_and_asset_ctxs ------------------------

server.tool(
  'hyperliquid_get_perpetuals_meta_and_asset_ctxs',
  'Get perpetuals metadata combined with current asset contexts (funding rates, open interest, mark prices) on Hyperliquid.',
  {},
  async () => {
    try {
      const result = await infoCall({ type: 'metaAndAssetCtxs' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_clearinghouse_state ------------------------------------

server.tool(
  'hyperliquid_get_clearinghouse_state',
  'Get detailed clearinghouse state for a user including margin details, positions, and account equity. Requires the user address.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'clearinghouseState', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hyperliquid_get_user_rate_limits --------------------------------------

server.tool(
  'hyperliquid_get_user_rate_limits',
  'Get the current rate limit status for a specific user on Hyperliquid.',
  {
    user: z.string().describe('User wallet address (0x...)'),
  },
  async ({ user }) => {
    try {
      const result = await infoCall({ type: 'userRateLimit', user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
