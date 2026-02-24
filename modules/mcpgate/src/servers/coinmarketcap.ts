/**
 * CoinMarketCap MCP Server -- Production-ready
 *
 * Provides tools to interact with the CoinMarketCap API for cryptocurrency
 * market data, coin info, global metrics, trending coins, and exchanges.
 *
 * API: https://pro-api.coinmarketcap.com
 * Auth: api-key-header with 'X-CMC_PRO_API_KEY'
 * Token env var: CMC_API_KEY
 *
 * Tools:
 *   cmc_get_listings          -- Get latest cryptocurrency listings
 *   cmc_get_quotes            -- Get quotes for specific cryptocurrencies
 *   cmc_get_info              -- Get metadata for cryptocurrencies
 *   cmc_get_map               -- Get CoinMarketCap ID map
 *   cmc_get_global_metrics    -- Get global crypto market metrics
 *   cmc_get_trending          -- Get trending cryptocurrencies
 *   cmc_get_gainers_losers    -- Get top gainers and losers
 *   cmc_get_categories        -- List cryptocurrency categories
 *   cmc_get_category          -- Get a specific category by ID
 *   cmc_list_exchanges        -- List exchanges
 *   cmc_get_exchange          -- Get exchange details
 *   cmc_get_price_conversion  -- Convert between cryptocurrencies/fiat
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'coinmarketcap',
  baseUrl: 'https://pro-api.coinmarketcap.com',
  tokenEnvVar: 'CMC_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'X-CMC_PRO_API_KEY',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'coinmarketcap-mcp',
  version: '0.1.0',
})

// ---- cmc_get_listings ------------------------------------------------------

server.tool(
  'cmc_get_listings',
  'Get the latest cryptocurrency listings from CoinMarketCap, ranked by market cap. Returns price, volume, market cap, and change data.',
  {
    start: z.number().int().optional().describe('Starting rank (1-based, default 1)'),
    limit: z.number().int().min(1).max(5000).optional().describe('Number of results to return (1-5000, default 100)'),
    convert: z.string().optional().describe('Currency to convert prices to (e.g. "USD", "EUR", "BTC"). Default "USD".'),
    sort: z.string().optional().describe('Sort field: "market_cap", "name", "symbol", "date_added", "price", "circulating_supply", "total_supply", "volume_24h", "percent_change_1h", "percent_change_24h", "percent_change_7d"'),
    sort_dir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    cryptocurrency_type: z.string().optional().describe('Filter by type: "all", "coins", "tokens"'),
  },
  async ({ start, limit, convert, sort, sort_dir, cryptocurrency_type }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (convert !== undefined) query.convert = convert
      if (sort !== undefined) query.sort = sort
      if (sort_dir !== undefined) query.sort_dir = sort_dir
      if (cryptocurrency_type !== undefined) query.cryptocurrency_type = cryptocurrency_type
      const result = await call('/v1/cryptocurrency/listings/latest', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_quotes --------------------------------------------------------

server.tool(
  'cmc_get_quotes',
  'Get latest market quotes for one or more cryptocurrencies. Specify by ID or symbol.',
  {
    id: z.string().optional().describe('Comma-separated CoinMarketCap IDs (e.g. "1,1027")'),
    symbol: z.string().optional().describe('Comma-separated symbols (e.g. "BTC,ETH")'),
    convert: z.string().optional().describe('Currency to convert prices to (default "USD")'),
    slug: z.string().optional().describe('Comma-separated slugs (e.g. "bitcoin,ethereum")'),
  },
  async ({ id, symbol, convert, slug }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (id !== undefined) query.id = id
      if (symbol !== undefined) query.symbol = symbol
      if (convert !== undefined) query.convert = convert
      if (slug !== undefined) query.slug = slug
      const result = await call('/v2/cryptocurrency/quotes/latest', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_info ----------------------------------------------------------

server.tool(
  'cmc_get_info',
  'Get metadata for one or more cryptocurrencies including description, logo, website, social links, and technical documentation.',
  {
    id: z.string().optional().describe('Comma-separated CoinMarketCap IDs'),
    symbol: z.string().optional().describe('Comma-separated symbols (e.g. "BTC,ETH")'),
    slug: z.string().optional().describe('Comma-separated slugs (e.g. "bitcoin,ethereum")'),
  },
  async ({ id, symbol, slug }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (id !== undefined) query.id = id
      if (symbol !== undefined) query.symbol = symbol
      if (slug !== undefined) query.slug = slug
      const result = await call('/v2/cryptocurrency/info', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_map -----------------------------------------------------------

server.tool(
  'cmc_get_map',
  'Get the CoinMarketCap ID map for all active cryptocurrencies. Useful for looking up IDs by symbol or slug.',
  {
    listing_status: z.string().optional().describe('Filter by listing status: "active", "inactive", "untracked" (default "active")'),
    start: z.number().int().optional().describe('Starting rank (1-based)'),
    limit: z.number().int().optional().describe('Number of results to return'),
    sort: z.string().optional().describe('Sort by: "id", "cmc_rank"'),
    symbol: z.string().optional().describe('Filter by symbol (e.g. "BTC")'),
  },
  async ({ listing_status, start, limit, sort, symbol }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (listing_status !== undefined) query.listing_status = listing_status
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (sort !== undefined) query.sort = sort
      if (symbol !== undefined) query.symbol = symbol
      const result = await call('/v1/cryptocurrency/map', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_global_metrics ------------------------------------------------

server.tool(
  'cmc_get_global_metrics',
  'Get global cryptocurrency market metrics including total market cap, volume, BTC dominance, and active cryptocurrency count.',
  {
    convert: z.string().optional().describe('Currency to convert values to (default "USD")'),
  },
  async ({ convert }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (convert !== undefined) query.convert = convert
      const result = await call('/v1/global-metrics/quotes/latest', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_trending ------------------------------------------------------

server.tool(
  'cmc_get_trending',
  'Get the latest trending cryptocurrencies on CoinMarketCap based on search and social activity.',
  {
    start: z.number().int().optional().describe('Starting rank (1-based)'),
    limit: z.number().int().optional().describe('Number of results to return'),
    convert: z.string().optional().describe('Currency to convert prices to (default "USD")'),
    time_period: z.string().optional().describe('Time period: "24h", "30d", "7d"'),
  },
  async ({ start, limit, convert, time_period }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (convert !== undefined) query.convert = convert
      if (time_period !== undefined) query.time_period = time_period
      const result = await call('/v1/cryptocurrency/trending/latest', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_gainers_losers ------------------------------------------------

server.tool(
  'cmc_get_gainers_losers',
  'Get the top cryptocurrency gainers and losers by price change percentage.',
  {
    start: z.number().int().optional().describe('Starting rank (1-based)'),
    limit: z.number().int().optional().describe('Number of results to return'),
    convert: z.string().optional().describe('Currency to convert prices to (default "USD")'),
    time_period: z.string().optional().describe('Time period: "1h", "24h", "7d", "30d"'),
    sort_dir: z.enum(['asc', 'desc']).optional().describe('Sort direction ("asc" for losers first, "desc" for gainers first)'),
  },
  async ({ start, limit, convert, time_period, sort_dir }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (convert !== undefined) query.convert = convert
      if (time_period !== undefined) query.time_period = time_period
      if (sort_dir !== undefined) query.sort_dir = sort_dir
      const result = await call('/v1/cryptocurrency/trending/gainers-losers', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_categories ----------------------------------------------------

server.tool(
  'cmc_get_categories',
  'List all cryptocurrency categories on CoinMarketCap with their aggregate market data.',
  {
    start: z.number().int().optional().describe('Starting rank (1-based)'),
    limit: z.number().int().optional().describe('Number of categories to return'),
    id: z.string().optional().describe('Filter by category ID'),
    slug: z.string().optional().describe('Filter by category slug'),
    symbol: z.string().optional().describe('Filter categories containing a specific cryptocurrency symbol'),
  },
  async ({ start, limit, id, slug, symbol }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (id !== undefined) query.id = id
      if (slug !== undefined) query.slug = slug
      if (symbol !== undefined) query.symbol = symbol
      const result = await call('/v1/cryptocurrency/categories', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_category ------------------------------------------------------

server.tool(
  'cmc_get_category',
  'Get detailed information about a specific cryptocurrency category by its ID, including all coins in the category.',
  {
    id: z.string().describe('Category ID from the categories endpoint'),
    start: z.number().int().optional().describe('Starting rank within the category (1-based)'),
    limit: z.number().int().optional().describe('Number of coins to return within the category'),
    convert: z.string().optional().describe('Currency to convert prices to (default "USD")'),
  },
  async ({ id, start, limit, convert }) => {
    try {
      const query: Record<string, string | undefined> = { id }
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (convert !== undefined) query.convert = convert
      const result = await call('/v1/cryptocurrency/category', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_list_exchanges ----------------------------------------------------

server.tool(
  'cmc_list_exchanges',
  'List cryptocurrency exchanges from CoinMarketCap, sorted by volume. Returns exchange metadata and trading volume.',
  {
    start: z.number().int().optional().describe('Starting rank (1-based)'),
    limit: z.number().int().optional().describe('Number of exchanges to return (default 100)'),
    sort: z.string().optional().describe('Sort by: "volume_24h", "name", "exchange_score"'),
    sort_dir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    convert: z.string().optional().describe('Currency to convert volumes to (default "USD")'),
    market_type: z.string().optional().describe('Filter by market type: "all", "fees", "no_fees"'),
  },
  async ({ start, limit, sort, sort_dir, convert, market_type }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (sort !== undefined) query.sort = sort
      if (sort_dir !== undefined) query.sort_dir = sort_dir
      if (convert !== undefined) query.convert = convert
      if (market_type !== undefined) query.market_type = market_type
      const result = await call('/v1/exchange/listings/latest', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_exchange ------------------------------------------------------

server.tool(
  'cmc_get_exchange',
  'Get detailed information about a specific cryptocurrency exchange including metadata, URLs, and social links.',
  {
    id: z.string().optional().describe('CoinMarketCap exchange ID'),
    slug: z.string().optional().describe('Exchange slug (e.g. "binance", "coinbase-exchange")'),
  },
  async ({ id, slug }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (id !== undefined) query.id = id
      if (slug !== undefined) query.slug = slug
      const result = await call('/v1/exchange/info', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cmc_get_price_conversion ----------------------------------------------

server.tool(
  'cmc_get_price_conversion',
  'Convert an amount from one cryptocurrency or fiat currency to another using CoinMarketCap rates.',
  {
    amount: z.number().describe('Amount to convert'),
    id: z.string().optional().describe('CoinMarketCap ID of the source currency'),
    symbol: z.string().optional().describe('Symbol of the source currency (e.g. "BTC")'),
    convert: z.string().optional().describe('Target currency symbol (e.g. "USD", "ETH")'),
    convert_id: z.string().optional().describe('Target currency CoinMarketCap ID'),
    time: z.string().optional().describe('Historical time to reference for conversion (ISO 8601 format)'),
  },
  async ({ amount, id, symbol, convert, convert_id, time }) => {
    try {
      const query: Record<string, string | undefined> = {
        amount: String(amount),
      }
      if (id !== undefined) query.id = id
      if (symbol !== undefined) query.symbol = symbol
      if (convert !== undefined) query.convert = convert
      if (convert_id !== undefined) query.convert_id = convert_id
      if (time !== undefined) query.time = time
      const result = await call('/v2/tools/price-conversion', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
