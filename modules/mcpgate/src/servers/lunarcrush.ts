/**
 * LunarCrush MCP Server -- Production-ready
 *
 * Provides tools to interact with the LunarCrush API v4 for cryptocurrency
 * social intelligence, sentiment analysis, Galaxy Score, and influencer data.
 *
 * API: https://lunarcrush.com/api4/public
 * Auth: Bearer token via LUNARCRUSH_TOKEN
 *
 * Tools:
 *   lunarcrush_get_coin           -- Get coin data with social metrics
 *   lunarcrush_list_coins         -- List all tracked coins
 *   lunarcrush_get_social_metrics -- Get time-series social data for a coin
 *   lunarcrush_get_influencers    -- Get top crypto influencers
 *   lunarcrush_get_feeds          -- Get social media feeds
 *   lunarcrush_get_topic          -- Get data for a specific topic
 *   lunarcrush_list_topics        -- List trending topics
 *   lunarcrush_get_market_pairs   -- Get market pairs for a coin
 *   lunarcrush_get_galaxy_score   -- Get Galaxy Score for a coin
 *   lunarcrush_get_alt_rank       -- Get AltRank for a coin
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'lunarcrush',
  baseUrl: 'https://lunarcrush.com/api4/public',
  tokenEnvVar: 'LUNARCRUSH_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'lunarcrush-mcp',
  version: '0.1.0',
})

// ---- lunarcrush_get_coin ---------------------------------------------------

server.tool(
  'lunarcrush_get_coin',
  'Get detailed coin data from LunarCrush including social metrics, Galaxy Score, AltRank, and market data.',
  {
    symbol: z.string().describe('Coin symbol (e.g. "BTC", "ETH", "SOL")'),
  },
  async ({ symbol }) => {
    try {
      const result = await call(`/coins/${encodeURIComponent(symbol.toUpperCase())}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_list_coins -------------------------------------------------

server.tool(
  'lunarcrush_list_coins',
  'List all coins tracked by LunarCrush with their basic data. Can be used to discover available coin symbols.',
  {
    sort: z.string().optional().describe('Sort field (e.g. "galaxy_score", "alt_rank", "market_cap", "volume_24h", "social_volume")'),
    limit: z.number().int().optional().describe('Number of coins to return'),
  },
  async ({ sort, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (sort !== undefined) query.sort = sort
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/coins/list', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_social_metrics -----------------------------------------

server.tool(
  'lunarcrush_get_social_metrics',
  'Get time-series social metrics for a specific coin from LunarCrush, including social volume, sentiment, and engagement over time.',
  {
    symbol: z.string().describe('Coin symbol (e.g. "BTC", "ETH")'),
    interval: z.string().optional().describe('Time interval: "1h", "1d", "1w" (default "1d")'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    end: z.number().optional().describe('End time as Unix timestamp in seconds'),
  },
  async ({ symbol, interval, start, end }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (interval !== undefined) query.interval = interval
      if (start !== undefined) query.start = String(start)
      if (end !== undefined) query.end = String(end)
      const result = await call(
        `/coins/${encodeURIComponent(symbol.toUpperCase())}/time-series`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_influencers --------------------------------------------

server.tool(
  'lunarcrush_get_influencers',
  'Get top cryptocurrency influencers from LunarCrush ranked by engagement and follower metrics.',
  {
    symbol: z.string().optional().describe('Filter influencers by coin symbol (e.g. "BTC")'),
    sort: z.string().optional().describe('Sort field (e.g. "followers", "engagement", "rank")'),
    limit: z.number().int().optional().describe('Number of influencers to return'),
  },
  async ({ symbol, sort, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (symbol !== undefined) query.symbol = symbol.toUpperCase()
      if (sort !== undefined) query.sort = sort
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/influencers', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_feeds --------------------------------------------------

server.tool(
  'lunarcrush_get_feeds',
  'Get social media feeds aggregated by LunarCrush across Twitter, Reddit, and other platforms.',
  {
    symbol: z.string().optional().describe('Filter feeds by coin symbol (e.g. "BTC")'),
    limit: z.number().int().optional().describe('Number of feed items to return'),
    start: z.number().optional().describe('Start time as Unix timestamp in seconds'),
    sources: z.string().optional().describe('Comma-separated source filter (e.g. "twitter", "reddit", "news")'),
  },
  async ({ symbol, limit, start, sources }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (symbol !== undefined) query.symbol = symbol.toUpperCase()
      if (limit !== undefined) query.limit = String(limit)
      if (start !== undefined) query.start = String(start)
      if (sources !== undefined) query.sources = sources
      const result = await call('/feeds', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_topic --------------------------------------------------

server.tool(
  'lunarcrush_get_topic',
  'Get data for a specific topic from LunarCrush including social volume, sentiment, and related content.',
  {
    topic: z.string().describe('Topic string (e.g. "defi", "nft", "bitcoin-etf", "layer2")'),
  },
  async ({ topic }) => {
    try {
      const result = await call(`/topics/${encodeURIComponent(topic)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_list_topics ------------------------------------------------

server.tool(
  'lunarcrush_list_topics',
  'List trending topics on LunarCrush ranked by social activity and engagement.',
  {
    limit: z.number().int().optional().describe('Number of topics to return'),
  },
  async ({ limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/topics', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_market_pairs -------------------------------------------

server.tool(
  'lunarcrush_get_market_pairs',
  'Get market trading pairs for a specific coin from LunarCrush, including exchange data and volume.',
  {
    symbol: z.string().describe('Coin symbol (e.g. "BTC", "ETH")'),
  },
  async ({ symbol }) => {
    try {
      const result = await call(
        `/coins/${encodeURIComponent(symbol.toUpperCase())}/market-pairs`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_galaxy_score -------------------------------------------

server.tool(
  'lunarcrush_get_galaxy_score',
  'Get the LunarCrush Galaxy Score for a specific coin. The Galaxy Score is a proprietary metric (0-100) combining social and market data to rank cryptocurrency quality.',
  {
    symbol: z.string().describe('Coin symbol (e.g. "BTC", "ETH", "SOL")'),
  },
  async ({ symbol }) => {
    try {
      const data = await call(`/coins/${encodeURIComponent(symbol.toUpperCase())}`)
      const coin = data as Record<string, unknown>
      return successContent({
        symbol: symbol.toUpperCase(),
        galaxy_score: coin.galaxy_score ?? coin.data?.galaxy_score ?? null,
        name: coin.name ?? null,
        raw: coin,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lunarcrush_get_alt_rank -----------------------------------------------

server.tool(
  'lunarcrush_get_alt_rank',
  'Get the LunarCrush AltRank for a specific coin. AltRank is a proprietary ranking that combines social and market activity to identify undervalued altcoins.',
  {
    symbol: z.string().describe('Coin symbol (e.g. "ETH", "SOL", "AVAX")'),
  },
  async ({ symbol }) => {
    try {
      const data = await call(`/coins/${encodeURIComponent(symbol.toUpperCase())}`)
      const coin = data as Record<string, unknown>
      return successContent({
        symbol: symbol.toUpperCase(),
        alt_rank: coin.alt_rank ?? coin.data?.alt_rank ?? null,
        name: coin.name ?? null,
        raw: coin,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
