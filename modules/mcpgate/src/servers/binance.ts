/**
 * Binance MCP Server -- Production-ready
 *
 * Provides tools to interact with the Binance REST API.
 * Public endpoints require only the API key header (X-MBX-APIKEY).
 * Private endpoints additionally require HMAC-SHA256 signing with
 * BINANCE_SECRET, appending timestamp and signature to the query string.
 *
 * Tools (public):
 *   binance_get_price       -- Get current price for a symbol
 *   binance_get_ticker      -- Get 24hr ticker statistics
 *   binance_list_symbols    -- List all trading pairs / exchange info
 *   binance_get_orderbook   -- Get order book depth
 *   binance_get_klines      -- Get candlestick/kline data
 *   binance_get_trades      -- Get recent trades
 *
 * Tools (private -- HMAC signed):
 *   binance_get_account     -- Get account information
 *   binance_create_order    -- Place a new order
 *   binance_cancel_order    -- Cancel an existing order
 *   binance_list_open_orders -- List all open orders
 *   binance_list_all_orders -- List all orders for a symbol
 *   binance_get_balance     -- Get balances from account data
 *   binance_get_deposit_address -- Get deposit address for a coin
 *   binance_list_deposits   -- List deposit history
 *   binance_list_withdrawals -- List withdrawal history
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient, signBinance } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client for public + api-key-authed endpoints
// ---------------------------------------------------------------------------

// Public endpoints -- no auth needed
const { call: publicCall, categoriseError } = createApiClient({
  name: 'binance',
  baseUrl: 'https://api.binance.com/api/v3',
  tokenEnvVar: 'BINANCE_API_KEY',
  authStyle: 'none',
})

// Authed endpoints -- API key in header
const { call: authedCall } = createApiClient({
  name: 'binance',
  baseUrl: 'https://api.binance.com/api/v3',
  tokenEnvVar: 'BINANCE_API_KEY',
  authStyle: 'custom-header',
  authHeader: 'X-MBX-APIKEY',
})

// ---------------------------------------------------------------------------
// HMAC-signed request helper for private endpoints
// ---------------------------------------------------------------------------

async function signedCall(
  path: string,
  opts: {
    method?: string
    params?: Record<string, string | undefined>
    baseUrl?: string
  } = {},
): Promise<unknown> {
  const apiKey = process.env.BINANCE_API_KEY || ''
  const secret = process.env.BINANCE_SECRET || ''
  if (!apiKey) {
    throw new Error('Binance API key not configured. Set BINANCE_API_KEY or connect via /v1/auth/connect/binance')
  }
  if (!secret) {
    throw new Error('Binance secret not configured. Set BINANCE_SECRET environment variable.')
  }

  const base = opts.baseUrl ?? 'https://api.binance.com/api/v3'
  const method = opts.method ?? 'GET'

  // Build query string from params, filtering out undefined
  const qp = new URLSearchParams()
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) qp.set(k, v)
    }
  }

  // Append timestamp
  qp.set('timestamp', Date.now().toString())

  // Compute HMAC-SHA256 signature
  const queryString = qp.toString()
  const signature = signBinance(queryString, secret)
  qp.set('signature', signature)

  const url = `${base}${path}?${qp.toString()}`

  const headers: Record<string, string> = {
    'X-MBX-APIKEY': apiKey,
  }

  const res = await fetch(url, { method, headers })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Binance API error (${res.status}): ${body}`)
  }

  if (res.status === 204) return {}
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'binance-mcp',
  version: '0.1.0',
})

// ========================================================================
// PUBLIC ENDPOINTS (no HMAC signature required)
// ========================================================================

// ---- binance_get_price ----------------------------------------------------

server.tool(
  'binance_get_price',
  'Get the current price for a Binance trading pair. Returns symbol and price.',
  {
    symbol: z.string().optional().describe('Trading pair symbol (e.g. "BTCUSDT"). Omit to get all prices.'),
  },
  async ({ symbol }) => {
    try {
      const query: Record<string, string | undefined> = { symbol }
      const result = await publicCall('/ticker/price', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_ticker ---------------------------------------------------

server.tool(
  'binance_get_ticker',
  'Get 24-hour rolling ticker statistics for a Binance trading pair. Includes volume, high, low, and price change.',
  {
    symbol: z.string().optional().describe('Trading pair symbol (e.g. "BTCUSDT"). Omit to get all tickers.'),
  },
  async ({ symbol }) => {
    try {
      const query: Record<string, string | undefined> = { symbol }
      const result = await publicCall('/ticker/24hr', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_list_symbols -------------------------------------------------

server.tool(
  'binance_list_symbols',
  'Get Binance exchange information including all trading pairs, filters, and rate limits.',
  {
    symbol: z.string().optional().describe('Specific trading pair to get info for (e.g. "BTCUSDT")'),
    symbols: z.string().optional().describe('JSON array of trading pairs (e.g. \'["BTCUSDT","ETHUSDT"]\')'),
  },
  async ({ symbol, symbols }) => {
    try {
      const query: Record<string, string | undefined> = { symbol, symbols }
      const result = await publicCall('/exchangeInfo', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_orderbook ------------------------------------------------

server.tool(
  'binance_get_orderbook',
  'Get the order book (bids and asks) for a Binance trading pair.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    limit: z.number().int().optional().describe('Number of price levels to return (5, 10, 20, 50, 100, 500, 1000, 5000)'),
  },
  async ({ symbol, limit }) => {
    try {
      const query: Record<string, string | undefined> = {
        symbol,
        limit: limit !== undefined ? String(limit) : undefined,
      }
      const result = await publicCall('/depth', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_klines ---------------------------------------------------

server.tool(
  'binance_get_klines',
  'Get candlestick/kline data for a Binance trading pair. Returns OHLCV data.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    interval: z.enum([
      '1s', '1m', '3m', '5m', '15m', '30m',
      '1h', '2h', '4h', '6h', '8h', '12h',
      '1d', '3d', '1w', '1M',
    ]).describe('Kline interval (e.g. "1h", "1d")'),
    startTime: z.number().int().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().int().optional().describe('End time as Unix timestamp in milliseconds'),
    limit: z.number().int().optional().describe('Number of klines to return (default 500, max 1000)'),
  },
  async ({ symbol, interval, startTime, endTime, limit }) => {
    try {
      const query: Record<string, string | undefined> = {
        symbol,
        interval,
        startTime: startTime !== undefined ? String(startTime) : undefined,
        endTime: endTime !== undefined ? String(endTime) : undefined,
        limit: limit !== undefined ? String(limit) : undefined,
      }
      const result = await publicCall('/klines', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_trades ---------------------------------------------------

server.tool(
  'binance_get_trades',
  'Get recent trades for a Binance trading pair.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    limit: z.number().int().optional().describe('Number of trades to return (default 500, max 1000)'),
  },
  async ({ symbol, limit }) => {
    try {
      const query: Record<string, string | undefined> = {
        symbol,
        limit: limit !== undefined ? String(limit) : undefined,
      }
      const result = await publicCall('/trades', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ========================================================================
// PRIVATE ENDPOINTS (HMAC-SHA256 signed)
// ========================================================================

// ---- binance_get_account --------------------------------------------------

server.tool(
  'binance_get_account',
  'Get Binance account information including balances, permissions, and trading status. Requires HMAC signature.',
  {
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/account', { params })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_create_order -------------------------------------------------

server.tool(
  'binance_create_order',
  'Place a new order on Binance. Supports LIMIT, MARKET, STOP_LOSS_LIMIT, and other order types. Requires HMAC signature.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    side: z.enum(['BUY', 'SELL']).describe('Order side: BUY or SELL'),
    type: z.enum([
      'LIMIT', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_LIMIT',
      'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT', 'LIMIT_MAKER',
    ]).describe('Order type'),
    timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional().describe('Time in force (required for LIMIT orders)'),
    quantity: z.string().optional().describe('Order quantity in base asset'),
    quoteOrderQty: z.string().optional().describe('Order quantity in quote asset (for MARKET orders)'),
    price: z.string().optional().describe('Order price (required for LIMIT orders)'),
    stopPrice: z.string().optional().describe('Stop price (required for STOP_LOSS and TAKE_PROFIT orders)'),
    newClientOrderId: z.string().optional().describe('Custom order ID for client reference'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ symbol, side, type, timeInForce, quantity, quoteOrderQty, price, stopPrice, newClientOrderId, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        symbol,
        side,
        type,
        timeInForce,
        quantity,
        quoteOrderQty,
        price,
        stopPrice,
        newClientOrderId,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/order', { method: 'POST', params })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_cancel_order -------------------------------------------------

server.tool(
  'binance_cancel_order',
  'Cancel an existing order on Binance. Requires either orderId or origClientOrderId. Requires HMAC signature.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    orderId: z.number().int().optional().describe('Binance order ID to cancel'),
    origClientOrderId: z.string().optional().describe('Client order ID to cancel'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ symbol, orderId, origClientOrderId, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        symbol,
        orderId: orderId !== undefined ? String(orderId) : undefined,
        origClientOrderId,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/order', { method: 'DELETE', params })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_list_open_orders ---------------------------------------------

server.tool(
  'binance_list_open_orders',
  'List all currently open orders on Binance. Optionally filter by symbol. Requires HMAC signature.',
  {
    symbol: z.string().optional().describe('Trading pair symbol to filter (e.g. "BTCUSDT"). Omit for all pairs.'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ symbol, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        symbol,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/openOrders', { params })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_list_all_orders ----------------------------------------------

server.tool(
  'binance_list_all_orders',
  'List all orders (open, filled, cancelled) for a symbol on Binance. Requires HMAC signature.',
  {
    symbol: z.string().describe('Trading pair symbol (e.g. "BTCUSDT")'),
    orderId: z.number().int().optional().describe('Only return orders with ID >= this value'),
    startTime: z.number().int().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().int().optional().describe('End time as Unix timestamp in milliseconds'),
    limit: z.number().int().optional().describe('Number of orders to return (default 500, max 1000)'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ symbol, orderId, startTime, endTime, limit, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        symbol,
        orderId: orderId !== undefined ? String(orderId) : undefined,
        startTime: startTime !== undefined ? String(startTime) : undefined,
        endTime: endTime !== undefined ? String(endTime) : undefined,
        limit: limit !== undefined ? String(limit) : undefined,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/allOrders', { params })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_balance --------------------------------------------------

server.tool(
  'binance_get_balance',
  'Get wallet balances from Binance account. Returns non-zero balances by default. Requires HMAC signature.',
  {
    asset: z.string().optional().describe('Specific asset to filter (e.g. "BTC"). Omit for all non-zero balances.'),
    showZero: z.boolean().optional().describe('Include zero-balance assets (default false)'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ asset, showZero, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = (await signedCall('/account', { params })) as {
        balances?: Array<{ asset: string; free: string; locked: string }>
      }

      let balances = result.balances ?? []

      // Filter to specific asset if requested
      if (asset) {
        balances = balances.filter(
          (b) => b.asset.toUpperCase() === asset.toUpperCase(),
        )
      } else if (!showZero) {
        // Filter out zero balances
        balances = balances.filter(
          (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
        )
      }

      return successContent(balances)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_get_deposit_address ------------------------------------------

server.tool(
  'binance_get_deposit_address',
  'Get a deposit address for a specific coin on Binance. Uses the /sapi/v1 endpoint. Requires HMAC signature.',
  {
    coin: z.string().describe('Coin symbol (e.g. "BTC", "ETH", "USDT")'),
    network: z.string().optional().describe('Network name (e.g. "ETH", "BSC", "TRX"). Omit for default network.'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ coin, network, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        coin,
        network,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/capital/deposit/address', {
        params,
        baseUrl: 'https://api.binance.com/sapi/v1',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_list_deposits ------------------------------------------------

server.tool(
  'binance_list_deposits',
  'List deposit history on Binance. Uses the /sapi/v1 endpoint. Requires HMAC signature.',
  {
    coin: z.string().optional().describe('Coin symbol to filter (e.g. "BTC")'),
    status: z.number().int().optional().describe('Deposit status (0=pending, 6=credited, 1=success)'),
    startTime: z.number().int().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().int().optional().describe('End time as Unix timestamp in milliseconds'),
    limit: z.number().int().optional().describe('Number of records to return (default 1000, max 1000)'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ coin, status, startTime, endTime, limit, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        coin,
        status: status !== undefined ? String(status) : undefined,
        startTime: startTime !== undefined ? String(startTime) : undefined,
        endTime: endTime !== undefined ? String(endTime) : undefined,
        limit: limit !== undefined ? String(limit) : undefined,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/capital/deposit/hisrec', {
        params,
        baseUrl: 'https://api.binance.com/sapi/v1',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- binance_list_withdrawals ---------------------------------------------

server.tool(
  'binance_list_withdrawals',
  'List withdrawal history on Binance. Uses the /sapi/v1 endpoint. Requires HMAC signature.',
  {
    coin: z.string().optional().describe('Coin symbol to filter (e.g. "BTC")'),
    status: z.number().int().optional().describe('Withdrawal status (0=email sent, 1=cancelled, 2=awaiting, 3=rejected, 4=processing, 5=failure, 6=completed)'),
    startTime: z.number().int().optional().describe('Start time as Unix timestamp in milliseconds'),
    endTime: z.number().int().optional().describe('End time as Unix timestamp in milliseconds'),
    limit: z.number().int().optional().describe('Number of records to return (default 1000, max 1000)'),
    recvWindow: z.number().int().optional().describe('Receive window in milliseconds (max 60000)'),
  },
  async ({ coin, status, startTime, endTime, limit, recvWindow }) => {
    try {
      const params: Record<string, string | undefined> = {
        coin,
        status: status !== undefined ? String(status) : undefined,
        startTime: startTime !== undefined ? String(startTime) : undefined,
        endTime: endTime !== undefined ? String(endTime) : undefined,
        limit: limit !== undefined ? String(limit) : undefined,
        recvWindow: recvWindow !== undefined ? String(recvWindow) : undefined,
      }
      const result = await signedCall('/capital/withdraw/history', {
        params,
        baseUrl: 'https://api.binance.com/sapi/v1',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
