/**
 * CryptoPanic MCP Server -- Production-ready
 *
 * Provides tools to interact with the CryptoPanic API for cryptocurrency
 * news aggregation, sentiment analysis, and trending content.
 *
 * API: https://cryptopanic.com/api/v1
 * Auth: api-key-query with 'auth_token'
 * Token env var: CRYPTOPANIC_TOKEN
 *
 * Tools:
 *   cryptopanic_get_posts          -- Get posts with optional filter
 *   cryptopanic_get_post           -- Get a specific post by ID
 *   cryptopanic_get_currencies     -- List supported currencies
 *   cryptopanic_filter_by_currency -- Get posts filtered by currency
 *   cryptopanic_filter_by_kind     -- Get posts filtered by content kind
 *   cryptopanic_get_trending       -- Get trending/hot posts
 *   cryptopanic_get_rising         -- Get rising posts
 *   cryptopanic_search             -- Search posts by keyword
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'cryptopanic',
  baseUrl: 'https://cryptopanic.com/api/v1',
  tokenEnvVar: 'CRYPTOPANIC_TOKEN',
  authStyle: 'api-key-query',
  authHeader: 'auth_token',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'cryptopanic-mcp',
  version: '0.1.0',
})

// ---- cryptopanic_get_posts -------------------------------------------------

server.tool(
  'cryptopanic_get_posts',
  'Get cryptocurrency news posts from CryptoPanic with optional filter for sentiment and popularity.',
  {
    filter: z.enum(['rising', 'hot', 'bullish', 'bearish', 'important', 'saved', 'lol']).optional().describe('Filter posts by category: "rising", "hot", "bullish", "bearish", "important", "saved", "lol"'),
    regions: z.string().optional().describe('Comma-separated region codes to filter by (e.g. "en", "de", "es")'),
    public: z.boolean().optional().describe('Only return posts with public details (default true)'),
    page: z.number().int().optional().describe('Page number for pagination'),
  },
  async ({ filter, regions, public: publicParam, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter !== undefined) query.filter = filter
      if (regions !== undefined) query.regions = regions
      if (publicParam !== undefined) query.public = String(publicParam)
      if (page !== undefined) query.page = String(page)
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_get_post --------------------------------------------------

server.tool(
  'cryptopanic_get_post',
  'Get a specific cryptocurrency news post from CryptoPanic by its ID.',
  {
    id: z.number().int().describe('Post ID to retrieve'),
  },
  async ({ id }) => {
    try {
      const result = await call(`/posts/${id}/`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_get_currencies --------------------------------------------

server.tool(
  'cryptopanic_get_currencies',
  'List all cryptocurrency currencies supported by CryptoPanic for filtering news.',
  {},
  async () => {
    try {
      const result = await call('/currencies/')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_filter_by_currency ----------------------------------------

server.tool(
  'cryptopanic_filter_by_currency',
  'Get cryptocurrency news posts filtered by specific currency/currencies from CryptoPanic.',
  {
    currencies: z.string().describe('Comma-separated currency codes to filter by (e.g. "BTC", "ETH,SOL")'),
    filter: z.enum(['rising', 'hot', 'bullish', 'bearish', 'important', 'saved', 'lol']).optional().describe('Additional sentiment/popularity filter'),
    page: z.number().int().optional().describe('Page number for pagination'),
    regions: z.string().optional().describe('Comma-separated region codes (e.g. "en", "de")'),
  },
  async ({ currencies, filter, page, regions }) => {
    try {
      const query: Record<string, string | undefined> = {
        currencies,
      }
      if (filter !== undefined) query.filter = filter
      if (page !== undefined) query.page = String(page)
      if (regions !== undefined) query.regions = regions
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_filter_by_kind --------------------------------------------

server.tool(
  'cryptopanic_filter_by_kind',
  'Get cryptocurrency posts filtered by content type (news articles, media, or analysis).',
  {
    kind: z.enum(['news', 'media', 'analysis']).describe('Content kind: "news" (articles), "media" (videos/podcasts), "analysis" (analysis pieces)'),
    filter: z.enum(['rising', 'hot', 'bullish', 'bearish', 'important', 'saved', 'lol']).optional().describe('Additional sentiment/popularity filter'),
    currencies: z.string().optional().describe('Comma-separated currency codes to filter by'),
    page: z.number().int().optional().describe('Page number for pagination'),
    regions: z.string().optional().describe('Comma-separated region codes'),
  },
  async ({ kind, filter, currencies, page, regions }) => {
    try {
      const query: Record<string, string | undefined> = {
        kind,
      }
      if (filter !== undefined) query.filter = filter
      if (currencies !== undefined) query.currencies = currencies
      if (page !== undefined) query.page = String(page)
      if (regions !== undefined) query.regions = regions
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_get_trending ----------------------------------------------

server.tool(
  'cryptopanic_get_trending',
  'Get the hottest/trending cryptocurrency news posts from CryptoPanic based on community votes and engagement.',
  {
    currencies: z.string().optional().describe('Comma-separated currency codes to filter by (e.g. "BTC,ETH")'),
    regions: z.string().optional().describe('Comma-separated region codes'),
    page: z.number().int().optional().describe('Page number for pagination'),
  },
  async ({ currencies, regions, page }) => {
    try {
      const query: Record<string, string | undefined> = {
        filter: 'hot',
      }
      if (currencies !== undefined) query.currencies = currencies
      if (regions !== undefined) query.regions = regions
      if (page !== undefined) query.page = String(page)
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_get_rising ------------------------------------------------

server.tool(
  'cryptopanic_get_rising',
  'Get rising cryptocurrency news posts from CryptoPanic -- posts gaining traction and engagement.',
  {
    currencies: z.string().optional().describe('Comma-separated currency codes to filter by (e.g. "BTC,ETH")'),
    regions: z.string().optional().describe('Comma-separated region codes'),
    page: z.number().int().optional().describe('Page number for pagination'),
  },
  async ({ currencies, regions, page }) => {
    try {
      const query: Record<string, string | undefined> = {
        filter: 'rising',
      }
      if (currencies !== undefined) query.currencies = currencies
      if (regions !== undefined) query.regions = regions
      if (page !== undefined) query.page = String(page)
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cryptopanic_search ----------------------------------------------------

server.tool(
  'cryptopanic_search',
  'Search cryptocurrency news posts on CryptoPanic by keyword. Returns matching posts with metadata and sentiment.',
  {
    search: z.string().describe('Search keyword or phrase (e.g. "SEC regulation", "bitcoin ETF")'),
    currencies: z.string().optional().describe('Comma-separated currency codes to filter by'),
    filter: z.enum(['rising', 'hot', 'bullish', 'bearish', 'important', 'saved', 'lol']).optional().describe('Additional sentiment/popularity filter'),
    kind: z.enum(['news', 'media', 'analysis']).optional().describe('Filter by content kind'),
    page: z.number().int().optional().describe('Page number for pagination'),
    regions: z.string().optional().describe('Comma-separated region codes'),
  },
  async ({ search, currencies, filter, kind, page, regions }) => {
    try {
      const query: Record<string, string | undefined> = {
        search,
      }
      if (currencies !== undefined) query.currencies = currencies
      if (filter !== undefined) query.filter = filter
      if (kind !== undefined) query.kind = kind
      if (page !== undefined) query.page = String(page)
      if (regions !== undefined) query.regions = regions
      const result = await call('/posts/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
