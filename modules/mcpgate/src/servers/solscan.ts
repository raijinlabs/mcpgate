/**
 * Solscan MCP Server -- Production-ready
 *
 * Provides tools to interact with the Solscan Pro API v2.0 for Solana
 * blockchain data. Covers account info, token data, transactions,
 * DeFi activities, NFTs, and market information.
 *
 * Tools:
 *   solscan_get_account          -- Get account overview
 *   solscan_get_token_accounts   -- Get token accounts for an address
 *   solscan_get_transactions     -- Get transactions for an address
 *   solscan_get_token_info       -- Get token metadata
 *   solscan_get_token_holders    -- Get token holders list
 *   solscan_get_token_price      -- Get token price
 *   solscan_get_block            -- Get block details by slot
 *   solscan_list_tokens          -- List tokens with market data
 *   solscan_get_defi_activities  -- Get DeFi activities for an address
 *   solscan_get_transfer_history -- Get transfer history for an address
 *   solscan_get_nft_info         -- Get NFT metadata
 *   solscan_get_market_info      -- Get market info by symbol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'solscan',
  baseUrl: 'https://pro-api.solscan.io/v2.0',
  tokenEnvVar: 'SOLSCAN_TOKEN',
  authStyle: 'api-key-header',
  authHeader: 'token',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'solscan-mcp',
  version: '0.1.0',
})

// ---- solscan_get_account ---------------------------------------------------

server.tool(
  'solscan_get_account',
  'Get an overview of a Solana account including SOL balance, token count, and account type.',
  {
    address: z.string().describe('Solana account address (base58-encoded public key)'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/account/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_token_accounts --------------------------------------------

server.tool(
  'solscan_get_token_accounts',
  'Get all SPL token accounts held by a Solana address. Returns token mint, balance, and account address for each holding.',
  {
    address: z.string().describe('Solana address to get token accounts for'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of results per page (1-50, default 10)'),
  },
  async ({ address, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = { address }
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      const result = await call('/account/token-accounts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_transactions ----------------------------------------------

server.tool(
  'solscan_get_transactions',
  'Get recent transactions for a Solana address. Returns transaction signatures, status, and basic details.',
  {
    address: z.string().describe('Solana address to get transactions for'),
    before: z
      .string()
      .optional()
      .describe('Cursor: return transactions before this signature (for pagination)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of transactions to return (1-50, default 10)'),
  },
  async ({ address, before, limit }) => {
    try {
      const query: Record<string, string | undefined> = { address }
      if (before) query.before = before
      if (limit !== undefined) query.limit = String(limit)
      const result = await call('/account/transactions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_token_info ------------------------------------------------

server.tool(
  'solscan_get_token_info',
  'Get metadata for an SPL token including name, symbol, decimals, supply, and price information.',
  {
    address: z.string().describe('SPL token mint address'),
  },
  async ({ address }) => {
    try {
      const result = await call('/token/meta', {
        query: { address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_token_holders ---------------------------------------------

server.tool(
  'solscan_get_token_holders',
  'Get a list of holders for a specific SPL token. Returns holder addresses, amounts, and percentages.',
  {
    address: z.string().describe('SPL token mint address'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of holders per page (1-50, default 10)'),
  },
  async ({ address, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = { address }
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      const result = await call('/token/holders', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_token_price -----------------------------------------------

server.tool(
  'solscan_get_token_price',
  'Get the current price for an SPL token in USD.',
  {
    address: z.string().describe('SPL token mint address'),
  },
  async ({ address }) => {
    try {
      const result = await call('/token/price', {
        query: { address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_block -----------------------------------------------------

server.tool(
  'solscan_get_block',
  'Get details of a Solana block by slot number. Returns block time, transactions count, and leader information.',
  {
    slot: z.number().int().describe('Solana slot number of the block to retrieve'),
  },
  async ({ slot }) => {
    try {
      const result = await call(`/block/${slot}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_list_tokens ---------------------------------------------------

server.tool(
  'solscan_list_tokens',
  'List SPL tokens with market data. Returns token name, symbol, price, volume, and market cap. Results are sorted by market cap.',
  {
    sort_by: z
      .enum(['market_cap', 'volume', 'holder', 'price', 'price_change_24h'])
      .optional()
      .describe('Sort field (default "market_cap")'),
    sort_order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction (default "desc")'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of tokens per page (1-50, default 10)'),
  },
  async ({ sort_by, sort_order, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (sort_by) query.sort_by = sort_by
      if (sort_order) query.sort_order = sort_order
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      const result = await call('/token/list', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_defi_activities -------------------------------------------

server.tool(
  'solscan_get_defi_activities',
  'Get DeFi activities for a Solana address including swaps, liquidity provision, staking, and other DeFi interactions.',
  {
    address: z.string().describe('Solana address to get DeFi activities for'),
    platform: z
      .string()
      .optional()
      .describe('Filter by DeFi platform (e.g. "raydium", "orca", "marinade")'),
    activity_type: z
      .string()
      .optional()
      .describe('Filter by activity type (e.g. "swap", "add_liquidity", "remove_liquidity")'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of activities per page (1-50, default 10)'),
  },
  async ({ address, platform, activity_type, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = { address }
      if (platform) query.platform = platform
      if (activity_type) query.activity_type = activity_type
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      const result = await call('/account/defi/activities', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_transfer_history ------------------------------------------

server.tool(
  'solscan_get_transfer_history',
  'Get token transfer history for a Solana address. Returns incoming and outgoing SPL token transfers.',
  {
    address: z.string().describe('Solana address to get transfer history for'),
    token: z
      .string()
      .optional()
      .describe('Filter by specific token mint address'),
    flow: z
      .enum(['in', 'out'])
      .optional()
      .describe('Filter by transfer direction: "in" for incoming, "out" for outgoing'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of transfers per page (1-50, default 10)'),
  },
  async ({ address, token, flow, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = { address }
      if (token) query.token = token
      if (flow) query.flow = flow
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      const result = await call('/account/transfer', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_nft_info --------------------------------------------------

server.tool(
  'solscan_get_nft_info',
  'Get metadata for a Solana NFT including name, image, collection, attributes, and owner information.',
  {
    address: z.string().describe('NFT mint address on Solana'),
  },
  async ({ address }) => {
    try {
      const result = await call('/nft/meta', {
        query: { address },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- solscan_get_market_info -----------------------------------------------

server.tool(
  'solscan_get_market_info',
  'Get market information for a trading pair by symbol. Returns price, volume, and market statistics.',
  {
    symbol: z.string().describe('Market symbol (e.g. "SOL", "RAY", "SRM")'),
  },
  async ({ symbol }) => {
    try {
      const result = await call('/market/info', {
        query: { symbol },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
