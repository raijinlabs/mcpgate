/**
 * DeBank MCP Server -- Production-ready
 *
 * Provides tools to query the DeBank Open API for wallet portfolio analytics,
 * token balances, protocol positions, NFTs, transaction history, gas prices,
 * and token approvals across all EVM chains.
 *
 * Tools:
 *   debank_get_total_balance    -- Get total balance across all chains
 *   debank_get_token_list       -- Get token holdings for a wallet
 *   debank_get_protocol_list    -- Get DeFi protocol positions
 *   debank_get_nft_list         -- Get NFT holdings for a wallet
 *   debank_get_history          -- Get transaction history
 *   debank_get_chain_list       -- Get supported chain list
 *   debank_get_token_info       -- Get token details by chain and address
 *   debank_get_protocol_info    -- Get protocol details by ID
 *   debank_get_gas_market       -- Get current gas prices for a chain
 *   debank_get_token_price      -- Get token price by chain and address
 *   debank_get_complex_protocol -- Get complex protocol positions for a user
 *   debank_get_approve_list     -- Get token approval list for a wallet
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'debank',
  baseUrl: 'https://pro-openapi.debank.com/v1',
  tokenEnvVar: 'DEBANK_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'AccessKey',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'debank-mcp',
  version: '0.1.0',
})

// ---- debank_get_total_balance ---------------------------------------------

server.tool(
  'debank_get_total_balance',
  'Get total portfolio balance across all EVM chains for a wallet address. Returns total USD value and per-chain breakdown.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get total balance for'),
  },
  async ({ address }) => {
    try {
      const result = await call('/user/total_balance', {
        query: { id: address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_token_list ------------------------------------------------

server.tool(
  'debank_get_token_list',
  'Get all token holdings for a wallet address on a specific chain. Returns token balances, prices, and USD values.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get tokens for'),
    chain_id: z
      .string()
      .describe('Chain identifier (e.g. "eth", "bsc", "matic", "arb", "op", "avax", "base")'),
    is_all: z
      .boolean()
      .optional()
      .describe('Include tokens with zero balance (default false)'),
  },
  async ({ address, chain_id, is_all }) => {
    try {
      const result = await call('/user/token_list', {
        query: {
          id: address,
          chain_id,
          is_all: is_all !== undefined ? String(is_all) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_protocol_list ---------------------------------------------

server.tool(
  'debank_get_protocol_list',
  'Get all DeFi protocol positions for a wallet address. Returns protocol names, positions, balances, and rewards across all chains.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get protocol positions for'),
  },
  async ({ address }) => {
    try {
      const result = await call('/user/protocol_list', {
        query: { id: address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_nft_list --------------------------------------------------

server.tool(
  'debank_get_nft_list',
  'Get all NFT holdings for a wallet address. Returns NFT collections, token IDs, images, and estimated values.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get NFTs for'),
    chain_id: z
      .string()
      .optional()
      .describe('Filter by chain (e.g. "eth", "matic"). Omit for all chains.'),
  },
  async ({ address, chain_id }) => {
    try {
      const result = await call('/user/nft_list', {
        query: {
          id: address,
          chain_id,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_history ---------------------------------------------------

server.tool(
  'debank_get_history',
  'Get transaction history for a wallet address. Returns recent transactions with decoded actions, token transfers, and values.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get history for'),
    chain_id: z
      .string()
      .optional()
      .describe('Filter by chain (e.g. "eth", "bsc"). Omit for all chains.'),
    start_time: z
      .number()
      .optional()
      .describe('Start timestamp in seconds (Unix epoch) for filtering'),
    page_count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Number of pages to return (default 1)'),
  },
  async ({ address, chain_id, start_time, page_count }) => {
    try {
      const result = await call('/user/history_list', {
        query: {
          id: address,
          chain_id,
          start_time: start_time !== undefined ? String(start_time) : undefined,
          page_count: page_count !== undefined ? String(page_count) : undefined,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_chain_list ------------------------------------------------

server.tool(
  'debank_get_chain_list',
  'Get the list of all supported EVM chains on DeBank with their IDs, names, native tokens, and explorer URLs.',
  {},
  async () => {
    try {
      const result = await call('/chain/list')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_token_info ------------------------------------------------

server.tool(
  'debank_get_token_info',
  'Get detailed information for a specific token by chain and contract address. Returns name, symbol, decimals, price, and logo.',
  {
    chain_id: z
      .string()
      .describe('Chain identifier (e.g. "eth", "bsc", "matic")'),
    token_id: z
      .string()
      .describe('Token contract address (0x...) or native token symbol'),
  },
  async ({ chain_id, token_id }) => {
    try {
      const result = await call('/token', {
        query: {
          chain_id,
          id: token_id,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_protocol_info ---------------------------------------------

server.tool(
  'debank_get_protocol_info',
  'Get detailed information for a DeFi protocol by its DeBank ID. Returns protocol name, TVL, chains supported, and logo.',
  {
    protocol_id: z
      .string()
      .describe('DeBank protocol ID (e.g. "uniswap3", "aave3", "lido")'),
  },
  async ({ protocol_id }) => {
    try {
      const result = await call('/protocol', {
        query: { id: protocol_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_gas_market ------------------------------------------------

server.tool(
  'debank_get_gas_market',
  'Get current gas price market data for a specific chain. Returns slow, normal, and fast gas prices with estimated wait times.',
  {
    chain_id: z
      .string()
      .describe('Chain identifier (e.g. "eth", "bsc", "matic", "arb")'),
  },
  async ({ chain_id }) => {
    try {
      const result = await call('/chain/gas_market', {
        query: { chain_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_token_price -----------------------------------------------

server.tool(
  'debank_get_token_price',
  'Get the current USD price of a token by chain and contract address. Returns the latest price from DeBank aggregated data.',
  {
    chain_id: z
      .string()
      .describe('Chain identifier (e.g. "eth", "bsc", "matic")'),
    token_id: z
      .string()
      .describe('Token contract address (0x...) or native token symbol'),
  },
  async ({ chain_id, token_id }) => {
    try {
      const result = await call('/token', {
        query: {
          chain_id,
          id: token_id,
        },
      })
      const data = result as Record<string, unknown>
      return successContent({
        chain_id,
        token_id,
        price: data.price,
        symbol: data.symbol,
        name: data.name,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_complex_protocol ------------------------------------------

server.tool(
  'debank_get_complex_protocol',
  'Get complex DeFi protocol positions for a user including LP positions, farming, staking, and lending positions with full breakdowns.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get complex positions for'),
    chain_id: z
      .string()
      .optional()
      .describe('Filter by chain (e.g. "eth", "bsc"). Omit for all chains.'),
  },
  async ({ address, chain_id }) => {
    try {
      const result = await call('/user/complex_protocol_list', {
        query: {
          id: address,
          chain_id,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- debank_get_approve_list ----------------------------------------------

server.tool(
  'debank_get_approve_list',
  'Get the list of token approvals (allowances) granted by a wallet address. Shows which contracts have permission to spend tokens and the approved amounts.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get approvals for'),
    chain_id: z
      .string()
      .optional()
      .describe('Filter by chain (e.g. "eth", "bsc"). Omit for all chains.'),
  },
  async ({ address, chain_id }) => {
    try {
      const result = await call('/user/approve_list', {
        query: {
          id: address,
          chain_id,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
