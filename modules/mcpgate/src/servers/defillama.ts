/**
 * DefiLlama MCP Server -- Production-ready
 *
 * Provides tools to query DeFi protocol data from DefiLlama's open APIs.
 * DefiLlama requires NO authentication -- all endpoints are free and public.
 *
 * Multiple base URLs are used:
 *   Main:        https://api.llama.fi
 *   Stablecoins: https://stablecoins.llama.fi
 *   Yields:      https://yields.llama.fi
 *   Bridges:     https://bridges.llama.fi
 *
 * Tools:
 *   defillama_get_protocols     -- List all DeFi protocols
 *   defillama_get_protocol      -- Get detailed protocol data
 *   defillama_get_tvl_history   -- Get historical total TVL across all chains
 *   defillama_get_chains        -- List all chains with TVL
 *   defillama_get_chain_tvl     -- Get historical TVL for a specific chain
 *   defillama_list_stablecoins  -- List all stablecoins
 *   defillama_get_stablecoin    -- Get stablecoin details by ID
 *   defillama_get_yields        -- List yield farming pools
 *   defillama_get_pool          -- Get yield pool chart data
 *   defillama_list_bridges      -- List cross-chain bridges
 *   defillama_get_volumes       -- Get DEX trading volumes overview
 *   defillama_get_fees          -- Get protocol fees/revenue overview
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client -- main base URL (api.llama.fi)
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'defillama',
  baseUrl: 'https://api.llama.fi',
  tokenEnvVar: 'DEFILLAMA_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Helper for alternate-domain fetches
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DefiLlama API error (${res.status}): ${body}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'defillama-mcp',
  version: '0.1.0',
})

// ---- defillama_get_protocols -----------------------------------------------

server.tool(
  'defillama_get_protocols',
  'List all DeFi protocols tracked by DefiLlama with their TVL, chain breakdowns, and metadata. Returns a large array of protocols.',
  {},
  async () => {
    try {
      const result = await call('/protocols')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_protocol ------------------------------------------------

server.tool(
  'defillama_get_protocol',
  'Get detailed data for a specific DeFi protocol including historical TVL, chain breakdown, token info, and raised funding.',
  {
    name: z.string().describe('Protocol slug/name as used by DefiLlama (e.g. "aave", "uniswap", "lido")'),
  },
  async ({ name }) => {
    try {
      const result = await call(`/protocol/${encodeURIComponent(name)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_tvl_history ---------------------------------------------

server.tool(
  'defillama_get_tvl_history',
  'Get historical total value locked (TVL) across all chains tracked by DefiLlama. Returns daily data points with date and TVL in USD.',
  {},
  async () => {
    try {
      const result = await call('/v2/historicalChainTvl')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_chains --------------------------------------------------

server.tool(
  'defillama_get_chains',
  'List all blockchain networks tracked by DefiLlama with their current TVL. Returns chain name, gecko ID, CMC ID, and TVL.',
  {},
  async () => {
    try {
      const result = await call('/v2/chains')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_chain_tvl -----------------------------------------------

server.tool(
  'defillama_get_chain_tvl',
  'Get historical TVL data for a specific blockchain chain. Returns daily data points with date and TVL in USD.',
  {
    chain: z.string().describe('Chain name (e.g. "Ethereum", "Solana", "Arbitrum")'),
  },
  async ({ chain }) => {
    try {
      const result = await call(`/v2/historicalChainTvl/${encodeURIComponent(chain)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_list_stablecoins --------------------------------------------

server.tool(
  'defillama_list_stablecoins',
  'List all stablecoins tracked by DefiLlama with their market caps, chain distributions, and peg data.',
  {
    includePrices: z
      .boolean()
      .optional()
      .describe('Include current price data in the response (default true)'),
  },
  async ({ includePrices }) => {
    try {
      const params = new URLSearchParams()
      if (includePrices !== undefined) params.set('includePrices', String(includePrices))
      const qs = params.toString()
      const url = `https://stablecoins.llama.fi/stablecoins${qs ? `?${qs}` : ''}`
      const result = await fetchJson(url)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_stablecoin ----------------------------------------------

server.tool(
  'defillama_get_stablecoin',
  'Get detailed data for a specific stablecoin including historical market cap, chain breakdown, and peg deviation history.',
  {
    id: z.string().describe('DefiLlama stablecoin ID (numeric, e.g. "1" for USDT)'),
  },
  async ({ id }) => {
    try {
      const url = `https://stablecoins.llama.fi/stablecoin/${encodeURIComponent(id)}`
      const result = await fetchJson(url)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_yields --------------------------------------------------

server.tool(
  'defillama_get_yields',
  'List yield farming pools across all DeFi protocols tracked by DefiLlama. Returns APY, TVL, and pool metadata. Can be filtered client-side.',
  {},
  async () => {
    try {
      const url = 'https://yields.llama.fi/pools'
      const result = await fetchJson(url)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_pool ----------------------------------------------------

server.tool(
  'defillama_get_pool',
  'Get historical APY and TVL chart data for a specific yield pool. Returns daily data points.',
  {
    pool: z.string().describe('Pool UUID from the yields/pools endpoint (e.g. "747c1d2a-c668-4682-b9f9-296708a3dd90")'),
  },
  async ({ pool }) => {
    try {
      const url = `https://yields.llama.fi/chart/${encodeURIComponent(pool)}`
      const result = await fetchJson(url)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_list_bridges ------------------------------------------------

server.tool(
  'defillama_list_bridges',
  'List all cross-chain bridges tracked by DefiLlama with their volume and chain support information.',
  {
    includeChains: z
      .boolean()
      .optional()
      .describe('Include chain-level breakdown data (default false)'),
  },
  async ({ includeChains }) => {
    try {
      const params = new URLSearchParams()
      if (includeChains !== undefined) params.set('includeChains', String(includeChains))
      const qs = params.toString()
      const url = `https://bridges.llama.fi/bridges${qs ? `?${qs}` : ''}`
      const result = await fetchJson(url)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_volumes -------------------------------------------------

server.tool(
  'defillama_get_volumes',
  'Get an overview of DEX trading volumes across all tracked protocols. Returns 24h volume, change percentages, and protocol breakdowns.',
  {
    excludeTotalDataChart: z
      .boolean()
      .optional()
      .describe('Exclude the total data chart from the response to reduce size'),
    excludeTotalDataChartBreakdown: z
      .boolean()
      .optional()
      .describe('Exclude the breakdown chart from the response to reduce size'),
  },
  async ({ excludeTotalDataChart, excludeTotalDataChartBreakdown }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (excludeTotalDataChart !== undefined) query.excludeTotalDataChart = String(excludeTotalDataChart)
      if (excludeTotalDataChartBreakdown !== undefined) query.excludeTotalDataChartBreakdown = String(excludeTotalDataChartBreakdown)
      const result = await call('/overview/dexs', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- defillama_get_fees ----------------------------------------------------

server.tool(
  'defillama_get_fees',
  'Get an overview of protocol fees and revenue across all tracked protocols. Returns 24h fees, revenue, and protocol breakdowns.',
  {
    excludeTotalDataChart: z
      .boolean()
      .optional()
      .describe('Exclude the total data chart from the response to reduce size'),
    excludeTotalDataChartBreakdown: z
      .boolean()
      .optional()
      .describe('Exclude the breakdown chart from the response to reduce size'),
  },
  async ({ excludeTotalDataChart, excludeTotalDataChartBreakdown }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (excludeTotalDataChart !== undefined) query.excludeTotalDataChart = String(excludeTotalDataChart)
      if (excludeTotalDataChartBreakdown !== undefined) query.excludeTotalDataChartBreakdown = String(excludeTotalDataChartBreakdown)
      const result = await call('/overview/fees', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
