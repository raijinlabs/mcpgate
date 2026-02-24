/**
 * 0x MCP Server -- Production-ready
 *
 * Provides tools to interact with the 0x DEX aggregator API.
 * Authentication uses the '0x-api-key' header.
 *
 * All swap endpoints accept a chainId query parameter to specify the
 * target chain (1=Ethereum, 137=Polygon, etc.).
 *
 * Tools:
 *   zerox_get_quote     -- Get a swap quote with full calldata
 *   zerox_get_price     -- Get an indicative price (no calldata)
 *   zerox_get_swap      -- Get a firm quote with taker address
 *   zerox_list_sources  -- List available liquidity sources
 *   zerox_get_tokens    -- List supported tokens
 *   zerox_get_orderbook -- Get limit orderbook for a pair
 *   zerox_create_order  -- Submit a limit order
 *   zerox_get_allowance -- Check ERC-20 allowance for 0x Exchange Proxy
 *   zerox_get_gas_price -- Get current gas price estimate
 *   zerox_get_chain_info -- Get supported chain information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'zerox',
  baseUrl: 'https://api.0x.org',
  tokenEnvVar: 'ZEROX_API_KEY',
  authStyle: 'api-key-header',
  authHeader: '0x-api-key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zerox-mcp',
  version: '0.1.0',
})

// ---- zerox_get_quote ------------------------------------------------------

server.tool(
  'zerox_get_quote',
  'Get a firm swap quote from 0x with full calldata for execution. Includes estimated gas and guaranteed price.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    sellToken: z.string().describe('Address or symbol of the token to sell (e.g. "ETH" or contract address)'),
    buyToken: z.string().describe('Address or symbol of the token to buy'),
    sellAmount: z.string().optional().describe('Amount of sellToken in smallest unit (mutually exclusive with buyAmount)'),
    buyAmount: z.string().optional().describe('Amount of buyToken in smallest unit (mutually exclusive with sellAmount)'),
    takerAddress: z.string().optional().describe('Address of the taker for the quote'),
    slippagePercentage: z.string().optional().describe('Maximum acceptable slippage (e.g. "0.01" for 1%)'),
    excludedSources: z.string().optional().describe('Comma-separated list of liquidity sources to exclude'),
    feeRecipient: z.string().optional().describe('Address to receive affiliate fees'),
    buyTokenPercentageFee: z.string().optional().describe('Percentage of buyToken to charge as fee (e.g. "0.01" for 1%)'),
  },
  async ({ chainId, sellToken, buyToken, sellAmount, buyAmount, takerAddress, slippagePercentage, excludedSources, feeRecipient, buyTokenPercentageFee }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
        sellToken,
        buyToken,
        sellAmount,
        buyAmount,
        takerAddress,
        slippagePercentage,
        excludedSources,
        feeRecipient,
        buyTokenPercentageFee,
      }
      const result = await call('/swap/v1/quote', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_price ------------------------------------------------------

server.tool(
  'zerox_get_price',
  'Get an indicative price from 0x without calldata. Faster than a full quote and useful for price discovery.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    sellToken: z.string().describe('Address or symbol of the token to sell'),
    buyToken: z.string().describe('Address or symbol of the token to buy'),
    sellAmount: z.string().optional().describe('Amount of sellToken in smallest unit (mutually exclusive with buyAmount)'),
    buyAmount: z.string().optional().describe('Amount of buyToken in smallest unit (mutually exclusive with sellAmount)'),
    excludedSources: z.string().optional().describe('Comma-separated list of liquidity sources to exclude'),
  },
  async ({ chainId, sellToken, buyToken, sellAmount, buyAmount, excludedSources }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
        sellToken,
        buyToken,
        sellAmount,
        buyAmount,
        excludedSources,
      }
      const result = await call('/swap/v1/price', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_swap -------------------------------------------------------

server.tool(
  'zerox_get_swap',
  'Get a firm swap quote from 0x with taker address included. Returns calldata ready for on-chain execution.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    sellToken: z.string().describe('Address or symbol of the token to sell'),
    buyToken: z.string().describe('Address or symbol of the token to buy'),
    sellAmount: z.string().optional().describe('Amount of sellToken in smallest unit'),
    buyAmount: z.string().optional().describe('Amount of buyToken in smallest unit'),
    takerAddress: z.string().describe('Address of the wallet executing the swap'),
    slippagePercentage: z.string().optional().describe('Maximum acceptable slippage (e.g. "0.01" for 1%)'),
    excludedSources: z.string().optional().describe('Comma-separated list of liquidity sources to exclude'),
  },
  async ({ chainId, sellToken, buyToken, sellAmount, buyAmount, takerAddress, slippagePercentage, excludedSources }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
        sellToken,
        buyToken,
        sellAmount,
        buyAmount,
        takerAddress,
        slippagePercentage,
        excludedSources,
      }
      const result = await call('/swap/v1/quote', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_list_sources ---------------------------------------------------

server.tool(
  'zerox_list_sources',
  'List all available liquidity sources (DEXes) supported by the 0x aggregator.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chainId }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
      }
      const result = await call('/swap/v1/sources', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_tokens -----------------------------------------------------

server.tool(
  'zerox_get_tokens',
  'List supported tokens for swapping on the 0x protocol.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chainId }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
      }
      const result = await call('/swap/v1/tokens', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_orderbook --------------------------------------------------

server.tool(
  'zerox_get_orderbook',
  'Get the 0x limit orderbook for a given token pair. Returns bids and asks.',
  {
    baseToken: z.string().describe('Base token contract address'),
    quoteToken: z.string().describe('Quote token contract address'),
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    perPage: z.number().int().optional().describe('Number of orders per page'),
    page: z.number().int().optional().describe('Page number for pagination'),
  },
  async ({ baseToken, quoteToken, chainId, perPage, page }) => {
    try {
      const query: Record<string, string | undefined> = {
        baseToken,
        quoteToken,
        chainId: chainId !== undefined ? String(chainId) : undefined,
        perPage: perPage !== undefined ? String(perPage) : undefined,
        page: page !== undefined ? String(page) : undefined,
      }
      const result = await call('/orderbook/v1', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_create_order ---------------------------------------------------

server.tool(
  'zerox_create_order',
  'Submit a signed limit order to the 0x orderbook. The order must be pre-signed off-chain.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    order: z.object({
      makerToken: z.string().describe('Maker token contract address'),
      takerToken: z.string().describe('Taker token contract address'),
      makerAmount: z.string().describe('Amount of maker token in smallest unit'),
      takerAmount: z.string().describe('Amount of taker token in smallest unit'),
      maker: z.string().describe('Maker (order creator) wallet address'),
      taker: z.string().optional().describe('Specific taker address (0x000...000 for any)'),
      expiry: z.string().describe('Order expiry as Unix timestamp'),
      salt: z.string().describe('Random salt for order uniqueness'),
      signature: z.object({
        signatureType: z.number().int().describe('Signature type (2 for EIP-712, 3 for EthSign)'),
        r: z.string().describe('ECDSA r value'),
        s: z.string().describe('ECDSA s value'),
        v: z.number().int().describe('ECDSA v value'),
      }).describe('EIP-712 signature components'),
    }).describe('The signed 0x limit order object'),
  },
  async ({ chainId, order }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
      }
      const result = await call('/orderbook/v1/order', {
        method: 'POST',
        body: order,
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_allowance --------------------------------------------------

server.tool(
  'zerox_get_allowance',
  'Check the ERC-20 allowance granted to the 0x Exchange Proxy by a given wallet. Useful before executing a swap.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    sellToken: z.string().describe('Token contract address to check allowance for'),
    takerAddress: z.string().describe('Wallet address to check allowance of'),
    sellAmount: z.string().describe('Amount needed in smallest unit to verify sufficient allowance'),
  },
  async ({ chainId, sellToken, takerAddress, sellAmount }) => {
    try {
      // The price endpoint returns allowance info when takerAddress is provided
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
        sellToken,
        buyToken: 'ETH', // any token works for allowance check
        sellAmount,
        takerAddress,
      }
      const result = await call('/swap/v1/price', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_gas_price --------------------------------------------------

server.tool(
  'zerox_get_gas_price',
  'Get current gas price estimate from the 0x API. Returns prices in wei for different speed tiers.',
  {
    chainId: z.number().int().optional().describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
    sellToken: z.string().optional().describe('Token to sell for gas estimation context (default ETH)'),
    buyToken: z.string().optional().describe('Token to buy for gas estimation context (default DAI)'),
    sellAmount: z.string().optional().describe('Amount for gas estimation context'),
  },
  async ({ chainId, sellToken, buyToken, sellAmount }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: chainId !== undefined ? String(chainId) : undefined,
        sellToken: sellToken ?? 'ETH',
        buyToken: buyToken ?? 'DAI',
        sellAmount: sellAmount ?? '1000000000000000000',
      }
      const result = await call('/swap/v1/price', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zerox_get_chain_info -------------------------------------------------

server.tool(
  'zerox_get_chain_info',
  'Get information about supported chains on the 0x protocol. Returns the available sources for a given chain.',
  {
    chainId: z.number().int().default(1).describe('EVM chain ID (1=Ethereum, 137=Polygon, 42161=Arbitrum, 8453=Base)'),
  },
  async ({ chainId }) => {
    try {
      const query: Record<string, string | undefined> = {
        chainId: String(chainId),
      }
      const result = await call('/swap/v1/sources', { query })
      return successContent({ chainId, sources: result })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
