/**
 * Kraken MCP Server -- Production-ready
 *
 * Provides tools to interact with the Kraken REST API.
 * Public endpoints use GET to /0/public/{method} with no auth.
 * Private endpoints use POST to /0/private/{method} with:
 *   - API-Key header:  KRAKEN_API_KEY
 *   - API-Sign header: HMAC-SHA512 signature (with SHA-256 pre-hash)
 *   - Body:            nonce=xxx&other_params (form-urlencoded)
 *
 * Tools (public):
 *   kraken_get_ticker     -- Get ticker info for a trading pair
 *   kraken_get_orderbook  -- Get order book for a pair
 *   kraken_get_ohlc       -- Get OHLC candlestick data
 *   kraken_get_trades     -- Get recent trades for a pair
 *   kraken_get_spread     -- Get recent spread data for a pair
 *   kraken_list_assets    -- List all tradable assets
 *   kraken_list_pairs     -- List all tradable asset pairs
 *
 * Tools (private -- HMAC signed):
 *   kraken_get_balance      -- Get account balances
 *   kraken_create_order     -- Place a new order
 *   kraken_cancel_order     -- Cancel an existing order
 *   kraken_list_open_orders -- List all open orders
 *   kraken_get_trade_history -- Get trade history
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, signKraken } from './shared/index.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KRAKEN_API = 'https://api.kraken.com/0'

// ---------------------------------------------------------------------------
// Public API helper (no auth)
// ---------------------------------------------------------------------------

async function krakenPublic(
  method: string,
  params?: Record<string, string | undefined>,
): Promise<unknown> {
  const qp = new URLSearchParams()
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qp.set(k, v)
    }
  }
  const qs = qp.toString()
  const url = `${KRAKEN_API}/public/${method}${qs ? `?${qs}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new KrakenApiError({ status: res.status, body })
  }

  const json = (await res.json()) as { error?: string[]; result?: unknown }
  if (json.error && json.error.length > 0) {
    throw new KrakenApiError({
      status: 200,
      body: json.error.join('; '),
    })
  }
  return json.result
}

// ---------------------------------------------------------------------------
// Private API helper (HMAC-SHA512 signed)
// ---------------------------------------------------------------------------

async function krakenPrivate(
  method: string,
  params?: Record<string, string | undefined>,
): Promise<unknown> {
  const apiKey = process.env.KRAKEN_API_KEY || ''
  const secret = process.env.KRAKEN_API_SECRET || ''

  if (!apiKey) {
    throw new Error(
      'Kraken API key not configured. Set KRAKEN_API_KEY or connect via /v1/auth/connect/kraken',
    )
  }
  if (!secret) {
    throw new Error(
      'Kraken API secret not configured. Set KRAKEN_API_SECRET environment variable.',
    )
  }

  const nonce = Date.now().toString()
  const path = `/0/private/${method}`

  // Build form-encoded body with nonce first
  const bodyParams = new URLSearchParams()
  bodyParams.set('nonce', nonce)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) bodyParams.set(k, v)
    }
  }
  const postData = bodyParams.toString()

  // Compute signature: HMAC-SHA512(path + SHA256(nonce + postData), base64decode(secret))
  const signature = signKraken(path, nonce, postData, secret)

  const url = `${KRAKEN_API}/private/${method}`
  const headers: Record<string, string> = {
    'API-Key': apiKey,
    'API-Sign': signature,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: postData,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new KrakenApiError({ status: res.status, body })
  }

  const json = (await res.json()) as { error?: string[]; result?: unknown }
  if (json.error && json.error.length > 0) {
    throw new KrakenApiError({
      status: 200,
      body: json.error.join('; '),
    })
  }
  return json.result
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class KrakenApiError extends Error {
  status: number

  constructor(detail: { status: number; body: string }) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'Kraken server error'
            : 'Kraken API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'KrakenApiError'
    this.status = detail.status
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof KrakenApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Kraken API key or secret may be invalid. Reconnect via /v1/auth/connect/kraken',
      }
    }
    if (err.status === 429) {
      return {
        message: err.message,
        hint: 'Rate limit hit. Please reduce request frequency.',
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Kraken is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'kraken-mcp',
  version: '0.1.0',
})

// ========================================================================
// PUBLIC ENDPOINTS
// ========================================================================

// ---- kraken_get_ticker ----------------------------------------------------

server.tool(
  'kraken_get_ticker',
  'Get ticker information for a Kraken trading pair. Returns ask, bid, last trade, volume, and more.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD", "XXBTZUSD")'),
  },
  async ({ pair }) => {
    try {
      const result = await krakenPublic('Ticker', { pair })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_get_orderbook -------------------------------------------------

server.tool(
  'kraken_get_orderbook',
  'Get the order book (asks and bids) for a Kraken trading pair.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD")'),
    count: z.number().int().optional().describe('Maximum number of asks/bids to return (1-500)'),
  },
  async ({ pair, count }) => {
    try {
      const result = await krakenPublic('Depth', {
        pair,
        count: count !== undefined ? String(count) : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_get_ohlc ------------------------------------------------------

server.tool(
  'kraken_get_ohlc',
  'Get OHLC (candlestick) data for a Kraken trading pair. Returns time, open, high, low, close, vwap, volume, count.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD")'),
    interval: z.number().int().optional().describe('Candle interval in minutes (1, 5, 15, 30, 60, 240, 1440, 10080, 21600)'),
    since: z.number().int().optional().describe('Return data since this Unix timestamp'),
  },
  async ({ pair, interval, since }) => {
    try {
      const result = await krakenPublic('OHLC', {
        pair,
        interval: interval !== undefined ? String(interval) : undefined,
        since: since !== undefined ? String(since) : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_get_trades ----------------------------------------------------

server.tool(
  'kraken_get_trades',
  'Get recent trades for a Kraken trading pair. Returns price, volume, time, buy/sell, market/limit.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD")'),
    since: z.string().optional().describe('Return trades since this trade ID (nanosecond timestamp)'),
    count: z.number().int().optional().describe('Maximum number of trades to return'),
  },
  async ({ pair, since, count }) => {
    try {
      const result = await krakenPublic('Trades', {
        pair,
        since,
        count: count !== undefined ? String(count) : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_get_spread ----------------------------------------------------

server.tool(
  'kraken_get_spread',
  'Get recent spread data for a Kraken trading pair. Returns timestamp, bid, and ask.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD")'),
    since: z.number().int().optional().describe('Return spread data since this Unix timestamp'),
  },
  async ({ pair, since }) => {
    try {
      const result = await krakenPublic('Spread', {
        pair,
        since: since !== undefined ? String(since) : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_list_assets ---------------------------------------------------

server.tool(
  'kraken_list_assets',
  'List all tradable assets on Kraken. Returns asset name, class, decimals, and display decimals.',
  {
    asset: z.string().optional().describe('Comma-separated list of specific assets to query (e.g. "XBT,ETH")'),
  },
  async ({ asset }) => {
    try {
      const result = await krakenPublic('Assets', { asset })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_list_pairs ----------------------------------------------------

server.tool(
  'kraken_list_pairs',
  'List all tradable asset pairs on Kraken. Returns pair name, base, quote, fees, and trading limits.',
  {
    pair: z.string().optional().describe('Comma-separated list of specific pairs to query (e.g. "XBTUSD,ETHUSD")'),
    info: z.enum(['info', 'leverage', 'fees', 'margin']).optional().describe('Type of information to return'),
  },
  async ({ pair, info }) => {
    try {
      const result = await krakenPublic('AssetPairs', { pair, info })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ========================================================================
// PRIVATE ENDPOINTS (HMAC-SHA512 signed)
// ========================================================================

// ---- kraken_get_balance ---------------------------------------------------

server.tool(
  'kraken_get_balance',
  'Get account balances on Kraken. Returns all non-zero balances. Requires HMAC signature.',
  {},
  async () => {
    try {
      const result = await krakenPrivate('Balance')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_create_order --------------------------------------------------

server.tool(
  'kraken_create_order',
  'Place a new order on Kraken. Supports market, limit, stop-loss, take-profit, and other order types. Requires HMAC signature.',
  {
    pair: z.string().describe('Trading pair (e.g. "XBTUSD", "ETHUSD")'),
    type: z.enum(['buy', 'sell']).describe('Order direction: buy or sell'),
    ordertype: z.enum([
      'market', 'limit', 'stop-loss', 'take-profit',
      'stop-loss-limit', 'take-profit-limit', 'settle-position',
    ]).describe('Order type'),
    volume: z.string().describe('Order volume in base currency (e.g. "0.01")'),
    price: z.string().optional().describe('Price for limit orders (required for limit, stop-loss-limit, take-profit-limit)'),
    price2: z.string().optional().describe('Secondary price for stop-loss-limit and take-profit-limit orders'),
    leverage: z.string().optional().describe('Leverage for margin trading (e.g. "2:1")'),
    oflags: z.string().optional().describe('Comma-separated order flags (e.g. "post,fcib,fciq,nompp,viqc")'),
    starttm: z.string().optional().describe('Scheduled start time (+<seconds>, Unix timestamp, or 0 for now)'),
    expiretm: z.string().optional().describe('Expiration time (+<seconds>, Unix timestamp, or 0 for no expiry)'),
    userref: z.string().optional().describe('User reference ID for the order'),
    validate: z.boolean().optional().describe('If true, validate the order but do not submit it'),
  },
  async ({ pair, type, ordertype, volume, price, price2, leverage, oflags, starttm, expiretm, userref, validate }) => {
    try {
      const params: Record<string, string | undefined> = {
        pair,
        type,
        ordertype,
        volume,
        price,
        price2,
        leverage,
        oflags,
        starttm,
        expiretm,
        userref,
        validate: validate ? 'true' : undefined,
      }
      const result = await krakenPrivate('AddOrder', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_cancel_order --------------------------------------------------

server.tool(
  'kraken_cancel_order',
  'Cancel an existing order on Kraken by transaction ID or user reference. Requires HMAC signature.',
  {
    txid: z.string().describe('Transaction ID (or user reference ID) of the order to cancel'),
  },
  async ({ txid }) => {
    try {
      const result = await krakenPrivate('CancelOrder', { txid })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_list_open_orders ----------------------------------------------

server.tool(
  'kraken_list_open_orders',
  'List all open orders on Kraken. Returns order details including status, volume, and price. Requires HMAC signature.',
  {
    trades: z.boolean().optional().describe('Include trades associated with orders in the response'),
    userref: z.string().optional().describe('Filter by user reference ID'),
  },
  async ({ trades, userref }) => {
    try {
      const params: Record<string, string | undefined> = {
        trades: trades ? 'true' : undefined,
        userref,
      }
      const result = await krakenPrivate('OpenOrders', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- kraken_get_trade_history ---------------------------------------------

server.tool(
  'kraken_get_trade_history',
  'Get trade history on Kraken. Returns closed/filled trades with details. Requires HMAC signature.',
  {
    type: z.enum(['all', 'any position', 'closed position', 'closing position', 'no position']).optional().describe('Type of trades to return'),
    trades: z.boolean().optional().describe('Include related trades in the response'),
    start: z.number().int().optional().describe('Start Unix timestamp for the query range'),
    end: z.number().int().optional().describe('End Unix timestamp for the query range'),
    ofs: z.number().int().optional().describe('Result offset for pagination'),
  },
  async ({ type, trades, start, end, ofs }) => {
    try {
      const params: Record<string, string | undefined> = {
        type,
        trades: trades ? 'true' : undefined,
        start: start !== undefined ? String(start) : undefined,
        end: end !== undefined ? String(end) : undefined,
        ofs: ofs !== undefined ? String(ofs) : undefined,
      }
      const result = await krakenPrivate('TradesHistory', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
