/**
 * CoinGecko MCP Server -- Production-ready
 *
 * Provides tools to interact with the CoinGecko API v3 for cryptocurrency
 * market data, coin info, trending coins, exchanges, NFTs, and more.
 *
 * IMPORTANT: CoinGecko free tier may return HTTP 200 with a body containing
 * `{ status: { error_code: 429 } }` on rate limit. All responses are checked
 * for both HTTP-level and body-level rate limit errors.
 *
 * Tools:
 *   coingecko_get_price          -- Get simple price for coin(s)
 *   coingecko_get_prices_batch   -- Get prices for multiple coins in one call
 *   coingecko_get_coin           -- Get detailed coin data by ID
 *   coingecko_list_coins         -- List all supported coins (id, symbol, name)
 *   coingecko_get_market_chart   -- Get historical market chart data
 *   coingecko_get_trending       -- Get trending search coins
 *   coingecko_list_categories    -- List all coin categories
 *   coingecko_get_global         -- Get global crypto market data
 *   coingecko_get_exchanges      -- List exchanges
 *   coingecko_get_exchange       -- Get exchange details by ID
 *   coingecko_search             -- Search for coins, categories, exchanges
 *   coingecko_list_nfts          -- List supported NFT collections
 *   coingecko_get_nft            -- Get NFT collection details by ID
 *   coingecko_get_coin_history   -- Get historical coin data by date
 *   coingecko_list_markets       -- Get coin market data with rankings
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, ApiError, categoriseError } = createApiClient({
  name: 'coingecko',
  baseUrl: 'https://api.coingecko.com/api/v3',
  tokenEnvVar: 'COINGECKO_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'x-cg-demo-api-key',
})

// ---------------------------------------------------------------------------
// CoinGecko body-level rate limit checker
// ---------------------------------------------------------------------------

/**
 * CoinGecko free tier returns HTTP 200 with `{ status: { error_code: 429 } }`
 * on rate limit. This helper checks the parsed response body and throws an
 * ApiError if a body-level rate limit or error is detected.
 */
function checkBodyRateLimit(data: unknown): void {
  if (data && typeof data === 'object' && 'status' in data) {
    const status = (data as Record<string, unknown>).status
    if (status && typeof status === 'object' && 'error_code' in status) {
      const errorCode = (status as Record<string, unknown>).error_code
      if (typeof errorCode === 'number' && errorCode === 429) {
        throw new ApiError({
          status: 429,
          body: JSON.stringify(data),
          retryAfterMs: 60_000,
        })
      }
      if (typeof errorCode === 'number' && errorCode >= 400) {
        const errorMessage =
          (status as Record<string, unknown>).error_message || 'Unknown CoinGecko error'
        throw new ApiError({
          status: errorCode,
          body: String(errorMessage),
        })
      }
    }
  }
}

/**
 * Wrapper around call() that also checks the body for CoinGecko-specific
 * rate limit patterns.
 */
async function cgCall(
  path: string,
  opts: { query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const data = await call(path, { query: opts.query })
  checkBodyRateLimit(data)
  return data
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'coingecko-mcp',
  version: '0.1.0',
})

// ---- coingecko_get_price ---------------------------------------------------

server.tool(
  'coingecko_get_price',
  'Get the current price of a cryptocurrency by its CoinGecko ID. Returns price in the specified vs currency.',
  {
    id: z.string().describe('CoinGecko coin ID (e.g. "bitcoin", "ethereum")'),
    vs_currency: z
      .string()
      .optional()
      .describe('Target currency to get price in (e.g. "usd", "eur"). Defaults to "usd".'),
  },
  async ({ id, vs_currency }) => {
    try {
      const result = await cgCall('/simple/price', {
        query: {
          ids: id,
          vs_currencies: vs_currency || 'usd',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_prices_batch --------------------------------------------

server.tool(
  'coingecko_get_prices_batch',
  'Get current prices for multiple cryptocurrencies in one request. Accepts a comma-separated list of CoinGecko coin IDs.',
  {
    ids: z
      .string()
      .describe('Comma-separated CoinGecko coin IDs (e.g. "bitcoin,ethereum,solana")'),
    vs_currencies: z
      .string()
      .optional()
      .describe('Comma-separated target currencies (e.g. "usd,eur,btc"). Defaults to "usd".'),
    include_market_cap: z
      .boolean()
      .optional()
      .describe('Include market cap in the response'),
    include_24hr_vol: z
      .boolean()
      .optional()
      .describe('Include 24hr volume in the response'),
    include_24hr_change: z
      .boolean()
      .optional()
      .describe('Include 24hr price change percentage in the response'),
  },
  async ({ ids, vs_currencies, include_market_cap, include_24hr_vol, include_24hr_change }) => {
    try {
      const result = await cgCall('/simple/price', {
        query: {
          ids,
          vs_currencies: vs_currencies || 'usd',
          include_market_cap: include_market_cap !== undefined ? String(include_market_cap) : undefined,
          include_24hr_vol: include_24hr_vol !== undefined ? String(include_24hr_vol) : undefined,
          include_24hr_change: include_24hr_change !== undefined ? String(include_24hr_change) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_coin ----------------------------------------------------

server.tool(
  'coingecko_get_coin',
  'Get detailed data for a cryptocurrency including description, links, market data, and community stats. Returns comprehensive coin information.',
  {
    id: z.string().describe('CoinGecko coin ID (e.g. "bitcoin", "ethereum")'),
    localization: z
      .boolean()
      .optional()
      .describe('Include all localised languages in response (default true)'),
    tickers: z
      .boolean()
      .optional()
      .describe('Include ticker data (default true)'),
    market_data: z
      .boolean()
      .optional()
      .describe('Include market data (default true)'),
    community_data: z
      .boolean()
      .optional()
      .describe('Include community data (default true)'),
    developer_data: z
      .boolean()
      .optional()
      .describe('Include developer data (default true)'),
  },
  async ({ id, localization, tickers, market_data, community_data, developer_data }) => {
    try {
      const result = await cgCall(`/coins/${encodeURIComponent(id)}`, {
        query: {
          localization: localization !== undefined ? String(localization) : undefined,
          tickers: tickers !== undefined ? String(tickers) : undefined,
          market_data: market_data !== undefined ? String(market_data) : undefined,
          community_data: community_data !== undefined ? String(community_data) : undefined,
          developer_data: developer_data !== undefined ? String(developer_data) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_list_coins --------------------------------------------------

server.tool(
  'coingecko_list_coins',
  'List all supported coins with their ID, symbol, and name. Useful for looking up coin IDs to use with other endpoints.',
  {
    include_platform: z
      .boolean()
      .optional()
      .describe('Include platform contract addresses (default false)'),
  },
  async ({ include_platform }) => {
    try {
      const result = await cgCall('/coins/list', {
        query: {
          include_platform: include_platform !== undefined ? String(include_platform) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_market_chart --------------------------------------------

server.tool(
  'coingecko_get_market_chart',
  'Get historical market chart data for a coin including price, market cap, and volume over time. Data granularity is automatic based on the days parameter.',
  {
    id: z.string().describe('CoinGecko coin ID (e.g. "bitcoin")'),
    vs_currency: z
      .string()
      .optional()
      .describe('Target currency (e.g. "usd"). Defaults to "usd".'),
    days: z
      .string()
      .describe('Number of days of data to retrieve (e.g. "1", "7", "30", "365", "max")'),
  },
  async ({ id, vs_currency, days }) => {
    try {
      const result = await cgCall(`/coins/${encodeURIComponent(id)}/market_chart`, {
        query: {
          vs_currency: vs_currency || 'usd',
          days,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_trending ------------------------------------------------

server.tool(
  'coingecko_get_trending',
  'Get the top trending coins on CoinGecko as searched by users in the last 24 hours. Returns a list of trending coins with basic metadata.',
  {},
  async () => {
    try {
      const result = await cgCall('/search/trending')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_list_categories ---------------------------------------------

server.tool(
  'coingecko_list_categories',
  'List all coin categories with market data including market cap, volume, and top coins per category.',
  {
    order: z
      .string()
      .optional()
      .describe('Sort order: "market_cap_desc", "market_cap_asc", "name_desc", "name_asc", "market_cap_change_24h_desc", "market_cap_change_24h_asc"'),
  },
  async ({ order }) => {
    try {
      const result = await cgCall('/coins/categories', {
        query: { order },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_global --------------------------------------------------

server.tool(
  'coingecko_get_global',
  'Get global cryptocurrency market data including total market cap, volume, BTC dominance, and number of active coins.',
  {},
  async () => {
    try {
      const result = await cgCall('/global')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_exchanges -----------------------------------------------

server.tool(
  'coingecko_get_exchanges',
  'List cryptocurrency exchanges ranked by trust score and trading volume. Results are paginated.',
  {
    per_page: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of exchanges per page (1-250, default 100)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
  },
  async ({ per_page, page }) => {
    try {
      const result = await cgCall('/exchanges', {
        query: {
          per_page: per_page !== undefined ? String(per_page) : undefined,
          page: page !== undefined ? String(page) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_exchange ------------------------------------------------

server.tool(
  'coingecko_get_exchange',
  'Get detailed information about a specific exchange including trust score, trading volume, and tickers.',
  {
    id: z.string().describe('CoinGecko exchange ID (e.g. "binance", "coinbase-exchange")'),
  },
  async ({ id }) => {
    try {
      const result = await cgCall(`/exchanges/${encodeURIComponent(id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_search ------------------------------------------------------

server.tool(
  'coingecko_search',
  'Search CoinGecko for coins, categories, and exchanges by keyword. Returns matching results across all categories.',
  {
    query: z.string().describe('Search query string (e.g. "bitcoin", "defi", "binance")'),
  },
  async ({ query }) => {
    try {
      const result = await cgCall('/search', {
        query: { query },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_list_nfts ---------------------------------------------------

server.tool(
  'coingecko_list_nfts',
  'List supported NFT collections on CoinGecko with their IDs and metadata. Results are paginated.',
  {
    per_page: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of NFT collections per page (1-250, default 100)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
    order: z
      .string()
      .optional()
      .describe('Sort order (e.g. "h24_volume_native_asc", "h24_volume_native_desc")'),
  },
  async ({ per_page, page, order }) => {
    try {
      const result = await cgCall('/nfts/list', {
        query: {
          per_page: per_page !== undefined ? String(per_page) : undefined,
          page: page !== undefined ? String(page) : undefined,
          order,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_nft -----------------------------------------------------

server.tool(
  'coingecko_get_nft',
  'Get detailed data for an NFT collection including floor price, volume, and market cap.',
  {
    id: z.string().describe('CoinGecko NFT collection ID (e.g. "bored-ape-yacht-club")'),
  },
  async ({ id }) => {
    try {
      const result = await cgCall(`/nfts/${encodeURIComponent(id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_get_coin_history --------------------------------------------

server.tool(
  'coingecko_get_coin_history',
  'Get historical data for a coin at a specific date including price, market cap, and volume. Date format must be dd-mm-yyyy.',
  {
    id: z.string().describe('CoinGecko coin ID (e.g. "bitcoin")'),
    date: z.string().describe('Date in dd-mm-yyyy format (e.g. "30-12-2023")'),
    localization: z
      .boolean()
      .optional()
      .describe('Include all localised languages in response (default true)'),
  },
  async ({ id, date, localization }) => {
    try {
      const result = await cgCall(`/coins/${encodeURIComponent(id)}/history`, {
        query: {
          date,
          localization: localization !== undefined ? String(localization) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- coingecko_list_markets ------------------------------------------------

server.tool(
  'coingecko_list_markets',
  'Get coin market data including price, market cap, volume, and sparkline. Results are ranked by market cap and paginated.',
  {
    vs_currency: z
      .string()
      .optional()
      .describe('Target currency for market data (e.g. "usd"). Defaults to "usd".'),
    ids: z
      .string()
      .optional()
      .describe('Comma-separated CoinGecko coin IDs to filter (e.g. "bitcoin,ethereum")'),
    category: z
      .string()
      .optional()
      .describe('Filter by category (e.g. "decentralized-finance-defi")'),
    order: z
      .string()
      .optional()
      .describe('Sort order: "market_cap_desc", "market_cap_asc", "volume_desc", "volume_asc", "id_asc", "id_desc"'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of coins per page (1-250, default 100)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
    sparkline: z
      .boolean()
      .optional()
      .describe('Include 7-day sparkline data (default false)'),
  },
  async ({ vs_currency, ids, category, order, per_page, page, sparkline }) => {
    try {
      const result = await cgCall('/coins/markets', {
        query: {
          vs_currency: vs_currency || 'usd',
          ids,
          category,
          order,
          per_page: per_page !== undefined ? String(per_page) : undefined,
          page: page !== undefined ? String(page) : undefined,
          sparkline: sparkline !== undefined ? String(sparkline) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
