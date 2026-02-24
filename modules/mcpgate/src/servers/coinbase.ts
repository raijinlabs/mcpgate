/**
 * Coinbase MCP Server -- Production-ready
 *
 * Provides tools to interact with the Coinbase V2 REST API.
 * Every request is authenticated with three headers:
 *   - CB-ACCESS-KEY:       API key
 *   - CB-ACCESS-SIGN:      HMAC-SHA256 signature
 *   - CB-ACCESS-TIMESTAMP: Unix epoch seconds
 *
 * The signature is computed as: HMAC-SHA256(timestamp + METHOD + path + body)
 *
 * Tools:
 *   coinbase_get_accounts       -- List all accounts (wallets)
 *   coinbase_get_account        -- Get a single account by ID
 *   coinbase_get_balance        -- Get balance for an account
 *   coinbase_list_transactions  -- List transactions for an account
 *   coinbase_send_money         -- Send cryptocurrency to an address
 *   coinbase_get_buy_price      -- Get buy price for a currency pair
 *   coinbase_get_sell_price     -- Get sell price for a currency pair
 *   coinbase_get_spot_price     -- Get spot price for a currency pair
 *   coinbase_list_currencies    -- List supported fiat currencies
 *   coinbase_get_exchange_rates -- Get exchange rates for a currency
 *   coinbase_create_address     -- Create a new receive address
 *   coinbase_get_user           -- Get current authenticated user info
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, signCoinbase } from './shared/index.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COINBASE_API = 'https://api.coinbase.com'
const API_VERSION = '2024-01-01'

// ---------------------------------------------------------------------------
// Custom Coinbase API helper (does NOT use createApiClient)
// ---------------------------------------------------------------------------

async function coinbaseApi(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const apiKey = process.env.COINBASE_API_KEY || ''
  const secret = process.env.COINBASE_API_SECRET || ''

  if (!apiKey) {
    throw new Error(
      'Coinbase API key not configured. Set COINBASE_API_KEY or connect via /v1/auth/connect/coinbase',
    )
  }
  if (!secret) {
    throw new Error(
      'Coinbase API secret not configured. Set COINBASE_API_SECRET environment variable.',
    )
  }

  const method = opts.method ?? 'GET'
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const bodyStr = opts.body ? JSON.stringify(opts.body) : ''

  // Signature = HMAC-SHA256(timestamp + METHOD + path + body, secret)
  const signature = signCoinbase(timestamp, method, path, bodyStr, secret)

  const headers: Record<string, string> = {
    'CB-ACCESS-KEY': apiKey,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'CB-VERSION': API_VERSION,
    'Content-Type': 'application/json',
  }

  const url = `${COINBASE_API}${path}`
  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new CoinbaseApiError({ status: res.status, body })
  }

  if (res.status === 204) return {}
  return res.json()
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class CoinbaseApiError extends Error {
  status: number

  constructor(detail: { status: number; body: string }) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'Coinbase server error'
            : 'Coinbase API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'CoinbaseApiError'
    this.status = detail.status
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof CoinbaseApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Coinbase API key or secret may be invalid. Reconnect via /v1/auth/connect/coinbase',
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
        hint: 'Coinbase is experiencing issues. Please try again shortly.',
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
  name: 'coinbase-mcp',
  version: '0.1.0',
})

// ---- coinbase_get_accounts ------------------------------------------------

server.tool(
  'coinbase_get_accounts',
  'List all Coinbase accounts (wallets). Each account holds a single currency. Results are paginated.',
  {
    limit: z.number().int().optional().describe('Number of accounts to return per page (default 25, max 100)'),
    starting_after: z.string().optional().describe('Cursor for pagination -- account ID to start after'),
  },
  async ({ limit, starting_after }) => {
    try {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (starting_after) params.set('starting_after', starting_after)
      const qs = params.toString()
      const path = `/v2/accounts${qs ? `?${qs}` : ''}`
      const result = await coinbaseApi(path)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_account -------------------------------------------------

server.tool(
  'coinbase_get_account',
  'Get a single Coinbase account by ID. Returns account details including balance.',
  {
    account_id: z.string().describe('Coinbase account ID (UUID)'),
  },
  async ({ account_id }) => {
    try {
      const result = await coinbaseApi(`/v2/accounts/${account_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_balance -------------------------------------------------

server.tool(
  'coinbase_get_balance',
  'Get the balance for a specific Coinbase account. Returns the native amount and currency.',
  {
    account_id: z.string().describe('Coinbase account ID (UUID)'),
  },
  async ({ account_id }) => {
    try {
      const result = (await coinbaseApi(`/v2/accounts/${account_id}`)) as {
        data?: { balance?: unknown; native_balance?: unknown; currency?: unknown }
      }
      const data = result.data
      return successContent({
        balance: data?.balance,
        native_balance: data?.native_balance,
        currency: data?.currency,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_list_transactions -------------------------------------------

server.tool(
  'coinbase_list_transactions',
  'List transactions for a Coinbase account. Includes sends, receives, buys, sells, and more.',
  {
    account_id: z.string().describe('Coinbase account ID (UUID)'),
    limit: z.number().int().optional().describe('Number of transactions to return per page (default 25, max 100)'),
    starting_after: z.string().optional().describe('Cursor for pagination -- transaction ID to start after'),
  },
  async ({ account_id, limit, starting_after }) => {
    try {
      const params = new URLSearchParams()
      if (limit !== undefined) params.set('limit', String(limit))
      if (starting_after) params.set('starting_after', starting_after)
      const qs = params.toString()
      const path = `/v2/accounts/${account_id}/transactions${qs ? `?${qs}` : ''}`
      const result = await coinbaseApi(path)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_send_money --------------------------------------------------

server.tool(
  'coinbase_send_money',
  'Send cryptocurrency from a Coinbase account to an external address or another Coinbase user. CAUTION: This initiates a real transfer.',
  {
    account_id: z.string().describe('Source Coinbase account ID (UUID)'),
    to: z.string().describe('Recipient address (crypto address or Coinbase user email)'),
    amount: z.string().describe('Amount to send in the account currency (e.g. "0.01")'),
    currency: z.string().describe('Currency code (e.g. "BTC", "ETH")'),
    description: z.string().optional().describe('Optional note/memo for the transaction'),
    idem: z.string().optional().describe('Idempotency key to prevent duplicate sends'),
  },
  async ({ account_id, to, amount, currency, description, idem }) => {
    try {
      const body: Record<string, unknown> = {
        type: 'send',
        to,
        amount,
        currency,
      }
      if (description !== undefined) body.description = description
      if (idem !== undefined) body.idem = idem

      const result = await coinbaseApi(`/v2/accounts/${account_id}/transactions`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_buy_price -----------------------------------------------

server.tool(
  'coinbase_get_buy_price',
  'Get the buy price for a currency pair on Coinbase (what it costs to buy).',
  {
    currency_pair: z.string().describe('Currency pair (e.g. "BTC-USD", "ETH-EUR")'),
  },
  async ({ currency_pair }) => {
    try {
      const result = await coinbaseApi(`/v2/prices/${currency_pair}/buy`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_sell_price ----------------------------------------------

server.tool(
  'coinbase_get_sell_price',
  'Get the sell price for a currency pair on Coinbase (what you receive when selling).',
  {
    currency_pair: z.string().describe('Currency pair (e.g. "BTC-USD", "ETH-EUR")'),
  },
  async ({ currency_pair }) => {
    try {
      const result = await coinbaseApi(`/v2/prices/${currency_pair}/sell`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_spot_price ----------------------------------------------

server.tool(
  'coinbase_get_spot_price',
  'Get the current spot price for a currency pair on Coinbase.',
  {
    currency_pair: z.string().describe('Currency pair (e.g. "BTC-USD", "ETH-EUR")'),
    date: z.string().optional().describe('Historical date in YYYY-MM-DD format for past spot price'),
  },
  async ({ currency_pair, date }) => {
    try {
      const params = new URLSearchParams()
      if (date) params.set('date', date)
      const qs = params.toString()
      const path = `/v2/prices/${currency_pair}/spot${qs ? `?${qs}` : ''}`
      const result = await coinbaseApi(path)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_list_currencies ---------------------------------------------

server.tool(
  'coinbase_list_currencies',
  'List all supported fiat currencies on Coinbase with their names and minimum sizes.',
  {},
  async () => {
    try {
      const result = await coinbaseApi('/v2/currencies')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_exchange_rates ------------------------------------------

server.tool(
  'coinbase_get_exchange_rates',
  'Get exchange rates for a given currency on Coinbase. Returns rates relative to the specified base currency.',
  {
    currency: z.string().optional().describe('Base currency code (default "USD")'),
  },
  async ({ currency }) => {
    try {
      const params = new URLSearchParams()
      if (currency) params.set('currency', currency)
      const qs = params.toString()
      const path = `/v2/exchange-rates${qs ? `?${qs}` : ''}`
      const result = await coinbaseApi(path)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_create_address ----------------------------------------------

server.tool(
  'coinbase_create_address',
  'Create a new receive address for a Coinbase account. Use this to generate a fresh deposit address.',
  {
    account_id: z.string().describe('Coinbase account ID (UUID)'),
    name: z.string().optional().describe('Label for the new address'),
  },
  async ({ account_id, name }) => {
    try {
      const body: Record<string, unknown> = {}
      if (name !== undefined) body.name = name

      const result = await coinbaseApi(`/v2/accounts/${account_id}/addresses`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coinbase_get_user ----------------------------------------------------

server.tool(
  'coinbase_get_user',
  'Get the currently authenticated Coinbase user profile. Returns name, email, and account details.',
  {},
  async () => {
    try {
      const result = await coinbaseApi('/v2/user')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
