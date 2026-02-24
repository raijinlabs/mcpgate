/**
 * DexScreener MCP Server -- Production-ready
 *
 * Provides tools to interact with the DexScreener API for DEX pair data,
 * token discovery, boosted tokens, and trending pairs.
 *
 * API: https://api.dexscreener.com
 * Auth: NONE (all endpoints are public)
 *
 * Tools:
 *   dexscreener_get_pair           -- Get pair data by chain and address
 *   dexscreener_search_pairs       -- Search for pairs by query
 *   dexscreener_get_token_pairs    -- Get all pairs for a token address
 *   dexscreener_get_token_profiles -- Get latest token profiles
 *   dexscreener_get_boosted_tokens -- Get latest boosted tokens
 *   dexscreener_get_top_boosted    -- Get top boosted tokens
 *   dexscreener_get_orders         -- Get orders for a token
 *   dexscreener_list_latest_pairs  -- List latest pairs on a chain
 *   dexscreener_get_pair_by_chain  -- Get pair by chain and pair address
 *   dexscreener_get_trending       -- Get trending pairs by volume
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'dexscreener',
  baseUrl: 'https://api.dexscreener.com',
  tokenEnvVar: 'DEXSCREENER_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dexscreener-mcp',
  version: '0.1.0',
})

// ---- dexscreener_get_pair --------------------------------------------------

server.tool(
  'dexscreener_get_pair',
  'Get detailed pair data from DexScreener by chain ID and pair address, including price, volume, liquidity, and price changes.',
  {
    chainId: z.string().describe('Blockchain chain ID (e.g. "ethereum", "bsc", "solana", "arbitrum", "polygon", "base")'),
    pairAddress: z.string().describe('DEX pair contract address'),
  },
  async ({ chainId, pairAddress }) => {
    try {
      const result = await call(
        `/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_search_pairs ----------------------------------------------

server.tool(
  'dexscreener_search_pairs',
  'Search for DEX pairs on DexScreener by query string. Searches across token names, symbols, and addresses.',
  {
    q: z.string().describe('Search query (e.g. "PEPE", "WETH/USDC", or a token address)'),
  },
  async ({ q }) => {
    try {
      const result = await call('/latest/dex/search', {
        query: { q },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_token_pairs -------------------------------------------

server.tool(
  'dexscreener_get_token_pairs',
  'Get all DEX pairs that include a specific token by its contract address. Returns pairs across all supported DEXes.',
  {
    tokenAddress: z.string().describe('Token contract address to find pairs for'),
  },
  async ({ tokenAddress }) => {
    try {
      const result = await call(
        `/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_token_profiles ----------------------------------------

server.tool(
  'dexscreener_get_token_profiles',
  'Get the latest token profiles from DexScreener including social links, descriptions, and community data.',
  {},
  async () => {
    try {
      const result = await call('/token-profiles/latest/v1')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_boosted_tokens ----------------------------------------

server.tool(
  'dexscreener_get_boosted_tokens',
  'Get the latest boosted tokens on DexScreener. Boosted tokens have paid for enhanced visibility.',
  {},
  async () => {
    try {
      const result = await call('/token-boosts/latest/v1')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_top_boosted -------------------------------------------

server.tool(
  'dexscreener_get_top_boosted',
  'Get the top boosted tokens on DexScreener, ranked by boost amount.',
  {},
  async () => {
    try {
      const result = await call('/token-boosts/top/v1')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_orders ------------------------------------------------

server.tool(
  'dexscreener_get_orders',
  'Get orders (paid orders/boosts) for a specific token on a specific chain from DexScreener.',
  {
    chainId: z.string().describe('Blockchain chain ID (e.g. "ethereum", "solana")'),
    tokenAddress: z.string().describe('Token contract address to get orders for'),
  },
  async ({ chainId, tokenAddress }) => {
    try {
      const result = await call(
        `/orders/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_list_latest_pairs -----------------------------------------

server.tool(
  'dexscreener_list_latest_pairs',
  'List the latest DEX pairs created on a specific blockchain chain from DexScreener.',
  {
    chainId: z.string().describe('Blockchain chain ID (e.g. "ethereum", "solana", "bsc", "arbitrum", "base")'),
  },
  async ({ chainId }) => {
    try {
      const result = await call(
        `/latest/dex/pairs/${encodeURIComponent(chainId)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_pair_by_chain -----------------------------------------

server.tool(
  'dexscreener_get_pair_by_chain',
  'Get a specific DEX pair by its chain ID and pair address from DexScreener. Returns full pair data with price, volume, and liquidity.',
  {
    chainId: z.string().describe('Blockchain chain ID (e.g. "ethereum", "solana")'),
    pairAddress: z.string().describe('DEX pair contract address'),
  },
  async ({ chainId, pairAddress }) => {
    try {
      const result = await call(
        `/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dexscreener_get_trending ----------------------------------------------

server.tool(
  'dexscreener_get_trending',
  'Get trending tokens on DexScreener by boost activity. Returns top boosted tokens which correlate with trending activity.',
  {},
  async () => {
    try {
      const result = await call('/token-boosts/top/v1')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
