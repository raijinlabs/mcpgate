/**
 * 1inch MCP Server -- Production-ready
 *
 * Provides tools to interact with the 1inch Swap / Orderbook API across
 * multiple EVM chains.  Credentials are injected via the ONEINCH_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * All endpoints are parameterised by chainId (1=Ethereum, 137=Polygon,
 * 42161=Arbitrum, 8453=Base, etc.).
 *
 * Tools:
 *   oneinch_get_quote            -- Get a swap quote
 *   oneinch_get_swap             -- Build a swap transaction
 *   oneinch_get_tokens           -- List supported tokens on a chain
 *   oneinch_get_liquidity_sources -- List available liquidity sources
 *   oneinch_get_approve_transaction -- Build an approval transaction
 *   oneinch_get_spender          -- Get the 1inch router spender address
 *   oneinch_check_allowance      -- Check token allowance for the router
 *   oneinch_get_protocols        -- List available swap protocols (alias)
 *   oneinch_get_token_info       -- Get info for a specific token
 *   oneinch_get_orderbook        -- Get limit orders from the orderbook
 *   oneinch_create_limit_order   -- Submit a new limit order
 *   oneinch_list_limit_orders    -- List limit orders for an address
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client for the swap v6 endpoints
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'oneinch',
  baseUrl: 'https://api.1inch.dev/swap/v6.0',
  tokenEnvVar: 'ONEINCH_TOKEN',
  authStyle: 'bearer',
})

// Orderbook API lives at a different base URL
const orderbook = createApiClient({
  name: 'oneinch-orderbook',
  baseUrl: 'https://api.1inch.dev/orderbook/v4.0',
  tokenEnvVar: 'ONEINCH_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'oneinch-mcp',
  version: '0.1.0',
})

// ---- oneinch_get_quote ----------------------------------------------------

server.tool(
  'oneinch_get_quote',
  'Get a swap quote from 1inch. Returns the expected output amount and estimated gas. Does not build a transaction.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    src: z.string().describe('Source token contract address (use 0xEEE...EEE for native token)'),
    dst: z.string().describe('Destination token contract address'),
    amount: z.string().describe('Amount of source token in smallest unit (wei for ETH)'),
    fee: z.string().optional().describe('Referrer fee percentage (e.g. "1" for 1%)'),
    protocols: z.string().optional().describe('Comma-separated list of protocols to use'),
    includeGas: z.boolean().optional().describe('Include gas estimation in response'),
  },
  async ({ chain_id, src, dst, amount, fee, protocols, includeGas }) => {
    try {
      const query: Record<string, string | undefined> = {
        src,
        dst,
        amount,
        fee,
        protocols,
        includeGas: includeGas !== undefined ? String(includeGas) : undefined,
      }
      const result = await call(`/${chain_id}/quote`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_swap -----------------------------------------------------

server.tool(
  'oneinch_get_swap',
  'Build a complete swap transaction via 1inch. Returns tx data ready to sign and broadcast.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    src: z.string().describe('Source token contract address'),
    dst: z.string().describe('Destination token contract address'),
    amount: z.string().describe('Amount of source token in smallest unit (wei)'),
    from: z.string().describe('Address of the wallet performing the swap'),
    slippage: z.number().min(0).max(50).describe('Maximum acceptable slippage percentage (e.g. 1 for 1%)'),
    protocols: z.string().optional().describe('Comma-separated list of protocols to use'),
    fee: z.string().optional().describe('Referrer fee percentage'),
    referrer: z.string().optional().describe('Referrer address for fee collection'),
    disableEstimate: z.boolean().optional().describe('Disable on-chain gas estimation'),
    allowPartialFill: z.boolean().optional().describe('Allow partial fill of the swap'),
  },
  async ({ chain_id, src, dst, amount, from, slippage, protocols, fee, referrer, disableEstimate, allowPartialFill }) => {
    try {
      const query: Record<string, string | undefined> = {
        src,
        dst,
        amount,
        from,
        slippage: String(slippage),
        protocols,
        fee,
        referrer,
        disableEstimate: disableEstimate !== undefined ? String(disableEstimate) : undefined,
        allowPartialFill: allowPartialFill !== undefined ? String(allowPartialFill) : undefined,
      }
      const result = await call(`/${chain_id}/swap`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_tokens ---------------------------------------------------

server.tool(
  'oneinch_get_tokens',
  'List all supported tokens on a given chain from the 1inch aggregator.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chain_id }) => {
    try {
      const result = await call(`/${chain_id}/tokens`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_liquidity_sources ----------------------------------------

server.tool(
  'oneinch_get_liquidity_sources',
  'List available liquidity sources (DEXes and protocols) on a given chain.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chain_id }) => {
    try {
      const result = await call(`/${chain_id}/liquidity-sources`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_approve_transaction --------------------------------------

server.tool(
  'oneinch_get_approve_transaction',
  'Build an ERC-20 approve transaction for the 1inch router. Returns tx data ready to sign.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    tokenAddress: z.string().describe('Contract address of the token to approve'),
    amount: z.string().optional().describe('Amount to approve in smallest unit. Omit for infinite approval.'),
  },
  async ({ chain_id, tokenAddress, amount }) => {
    try {
      const query: Record<string, string | undefined> = {
        tokenAddress,
        amount,
      }
      const result = await call(`/${chain_id}/approve/transaction`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_spender --------------------------------------------------

server.tool(
  'oneinch_get_spender',
  'Get the 1inch router contract address (spender) that tokens must be approved to.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chain_id }) => {
    try {
      const result = await call(`/${chain_id}/approve/spender`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_check_allowance ----------------------------------------------

server.tool(
  'oneinch_check_allowance',
  'Check the current ERC-20 allowance for the 1inch router from a given wallet.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    tokenAddress: z.string().describe('Contract address of the token to check'),
    walletAddress: z.string().describe('Wallet address to check allowance for'),
  },
  async ({ chain_id, tokenAddress, walletAddress }) => {
    try {
      const query: Record<string, string | undefined> = {
        tokenAddress,
        walletAddress,
      }
      const result = await call(`/${chain_id}/approve/allowance`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_protocols ------------------------------------------------

server.tool(
  'oneinch_get_protocols',
  'List available swap protocols on a given chain (alias for liquidity-sources).',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chain_id }) => {
    try {
      const result = await call(`/${chain_id}/liquidity-sources`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_token_info -----------------------------------------------

server.tool(
  'oneinch_get_token_info',
  'Get detailed info for a specific token on a chain. Fetches the full token list and filters by address.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    token_address: z.string().describe('Contract address of the token to look up'),
  },
  async ({ chain_id, token_address }) => {
    try {
      const result = await call(`/${chain_id}/tokens`) as { tokens?: Record<string, unknown> }
      const addr = token_address.toLowerCase()
      const tokens = result.tokens ?? result
      const tokenMap = tokens as Record<string, unknown>
      // 1inch returns tokens keyed by lowercase address
      const match = tokenMap[addr] ?? tokenMap[token_address]
      if (!match) {
        return errorContent(
          new Error(`Token ${token_address} not found on chain ${chain_id}`),
          categoriseError,
        )
      }
      return successContent(match)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- oneinch_get_orderbook ------------------------------------------------

server.tool(
  'oneinch_get_orderbook',
  'Get limit orders from the 1inch orderbook for a given token pair.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    makerAsset: z.string().optional().describe('Maker asset (token being sold) contract address'),
    takerAsset: z.string().optional().describe('Taker asset (token being bought) contract address'),
    limit: z.number().int().optional().describe('Maximum number of orders to return'),
    page: z.number().int().optional().describe('Page number for pagination'),
  },
  async ({ chain_id, makerAsset, takerAsset, limit, page }) => {
    try {
      const query: Record<string, string | undefined> = {
        makerAsset,
        takerAsset,
        limit: limit !== undefined ? String(limit) : undefined,
        page: page !== undefined ? String(page) : undefined,
      }
      const result = await orderbook.call(`/${chain_id}/all`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, orderbook.categoriseError)
    }
  },
)

// ---- oneinch_create_limit_order -------------------------------------------

server.tool(
  'oneinch_create_limit_order',
  'Submit a new limit order to the 1inch orderbook. The order data must be pre-signed off-chain.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    orderHash: z.string().describe('Hash of the signed order'),
    signature: z.string().describe('EIP-712 signature of the order'),
    data: z.object({
      makerAsset: z.string().describe('Maker asset contract address'),
      takerAsset: z.string().describe('Taker asset contract address'),
      maker: z.string().describe('Maker (order creator) wallet address'),
      makingAmount: z.string().describe('Amount of maker asset in smallest unit'),
      takingAmount: z.string().describe('Amount of taker asset in smallest unit'),
      salt: z.string().describe('Random salt for order uniqueness'),
    }).describe('The order data object'),
  },
  async ({ chain_id, orderHash, signature, data }) => {
    try {
      const result = await orderbook.call(`/${chain_id}`, {
        method: 'POST',
        body: { orderHash, signature, data },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, orderbook.categoriseError)
    }
  },
)

// ---- oneinch_list_limit_orders --------------------------------------------

server.tool(
  'oneinch_list_limit_orders',
  'List limit orders created by a specific address on the 1inch orderbook.',
  {
    chain_id: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    address: z.string().describe('Wallet address to list orders for'),
    limit: z.number().int().optional().describe('Maximum number of orders to return'),
    page: z.number().int().optional().describe('Page number for pagination'),
    statuses: z.string().optional().describe('Comma-separated order statuses to filter (e.g. "1,2")'),
  },
  async ({ chain_id, address, limit, page, statuses }) => {
    try {
      const query: Record<string, string | undefined> = {
        limit: limit !== undefined ? String(limit) : undefined,
        page: page !== undefined ? String(page) : undefined,
        statuses,
      }
      const result = await orderbook.call(`/${chain_id}/address/${address}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, orderbook.categoriseError)
    }
  },
)

export default server
