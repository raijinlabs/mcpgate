/**
 * Zapper MCP Server -- Production-ready
 *
 * Provides tools to query the Zapper API v2 for portfolio tracking, DeFi
 * balances, NFT holdings, token prices, gas prices, and transaction history
 * across multiple EVM chains.
 *
 * Tools:
 *   zapper_get_balances       -- Get token balances for address(es)
 *   zapper_get_portfolio      -- Get DeFi app positions for address(es)
 *   zapper_get_nft_portfolio  -- Get NFT holdings for an address
 *   zapper_list_apps          -- List supported DeFi apps
 *   zapper_get_app            -- Get details for a single DeFi app
 *   zapper_get_token_prices   -- Get prices for token addresses
 *   zapper_get_gas_prices     -- Get current gas prices
 *   zapper_get_transactions   -- Get transaction history
 *   zapper_get_net_worth      -- Get net worth for address(es)
 *   zapper_get_supported_chains-- Get list of supported chains
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'zapper',
  baseUrl: 'https://api.zapper.xyz/v2',
  tokenEnvVar: 'ZAPPER_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zapper-mcp',
  version: '0.1.0',
})

// ---- zapper_get_balances --------------------------------------------------

server.tool(
  'zapper_get_balances',
  'Get token balances for one or more wallet addresses across all supported chains. Returns tokens, amounts, prices, and USD values.',
  {
    addresses: z
      .array(z.string())
      .min(1)
      .max(25)
      .describe('Array of wallet addresses (0x...) to get balances for (max 25)'),
    network: z
      .string()
      .optional()
      .describe('Filter by network (e.g. "ethereum", "polygon", "arbitrum", "optimism", "base")'),
  },
  async ({ addresses, network }) => {
    try {
      const query: Record<string, string | undefined> = {}
      addresses.forEach((addr, i) => {
        query[`addresses[]`] = i === 0 ? addr : undefined
      })
      if (network) query.network = network
      // Build the addresses query manually for multi-value support
      const addrParams = addresses.map((a) => `addresses[]=${encodeURIComponent(a)}`).join('&')
      const networkParam = network ? `&network=${encodeURIComponent(network)}` : ''
      const result = await call(`/balances?${addrParams}${networkParam}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_portfolio -------------------------------------------------

server.tool(
  'zapper_get_portfolio',
  'Get DeFi app positions for one or more wallet addresses. Returns protocol-specific positions including LP tokens, staking, lending, and farming.',
  {
    addresses: z
      .array(z.string())
      .min(1)
      .max(25)
      .describe('Array of wallet addresses (0x...) to get portfolio for (max 25)'),
    network: z
      .string()
      .optional()
      .describe('Filter by network (e.g. "ethereum", "polygon")'),
  },
  async ({ addresses, network }) => {
    try {
      const addrParams = addresses.map((a) => `addresses[]=${encodeURIComponent(a)}`).join('&')
      const networkParam = network ? `&network=${encodeURIComponent(network)}` : ''
      const result = await call(`/balances/apps?${addrParams}${networkParam}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_nft_portfolio ---------------------------------------------

server.tool(
  'zapper_get_nft_portfolio',
  'Get NFT holdings for a wallet address on Zapper. Returns NFT collections, individual tokens, images, and estimated values.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get NFT holdings for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max number of NFTs to return (default 50)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ address, limit, cursor }) => {
    try {
      const result = await call('/nft/balances/tokens', {
        query: {
          userAddress: address,
          limit: String(limit ?? 50),
          cursor,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_list_apps -----------------------------------------------------

server.tool(
  'zapper_list_apps',
  'List all supported DeFi apps and protocols on Zapper. Returns app IDs, names, descriptions, supported networks, and TVL.',
  {},
  async () => {
    try {
      const result = await call('/apps')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_app -------------------------------------------------------

server.tool(
  'zapper_get_app',
  'Get detailed information for a specific DeFi app on Zapper. Returns app description, supported networks, TVL, and available position types.',
  {
    app_id: z
      .string()
      .describe('Zapper app ID (e.g. "uniswap-v3", "aave-v3", "lido", "curve")'),
  },
  async ({ app_id }) => {
    try {
      const result = await call(`/apps/${encodeURIComponent(app_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_token_prices ----------------------------------------------

server.tool(
  'zapper_get_token_prices',
  'Get current prices for one or more token addresses. Returns USD prices and metadata for each token.',
  {
    token_addresses: z
      .array(z.string())
      .min(1)
      .max(25)
      .describe('Array of token contract addresses (0x...) to get prices for'),
    network: z
      .string()
      .optional()
      .describe('Network the tokens are on (e.g. "ethereum", "polygon"). Defaults to "ethereum".'),
  },
  async ({ token_addresses, network }) => {
    try {
      const tokenParams = token_addresses
        .map((a) => `tokenAddresses[]=${encodeURIComponent(a)}`)
        .join('&')
      const networkParam = network ? `&network=${encodeURIComponent(network)}` : '&network=ethereum'
      const result = await call(`/prices?${tokenParams}${networkParam}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_gas_prices ------------------------------------------------

server.tool(
  'zapper_get_gas_prices',
  'Get current gas prices across supported EVM networks. Returns slow, standard, fast, and instant gas price estimates.',
  {
    network: z
      .string()
      .optional()
      .describe('Filter by network (e.g. "ethereum", "polygon"). Omit for all networks.'),
  },
  async ({ network }) => {
    try {
      const result = await call('/gas-prices', {
        query: { network },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_transactions ----------------------------------------------

server.tool(
  'zapper_get_transactions',
  'Get decoded transaction history for a wallet address. Returns transactions with human-readable actions, token transfers, and values.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) to get transactions for'),
    network: z
      .string()
      .optional()
      .describe('Filter by network (e.g. "ethereum", "polygon")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Max number of transactions to return (default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ address, network, limit, cursor }) => {
    try {
      const result = await call('/transactions', {
        query: {
          address,
          network,
          limit: String(limit ?? 25),
          cursor,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_net_worth -------------------------------------------------

server.tool(
  'zapper_get_net_worth',
  'Get the total net worth across all chains and protocols for one or more wallet addresses. Returns a single aggregated USD value.',
  {
    addresses: z
      .array(z.string())
      .min(1)
      .max(25)
      .describe('Array of wallet addresses (0x...) to calculate net worth for (max 25)'),
  },
  async ({ addresses }) => {
    try {
      const addrParams = addresses.map((a) => `addresses[]=${encodeURIComponent(a)}`).join('&')
      const result = await call(`/balances/net-worth?${addrParams}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapper_get_supported_chains ------------------------------------------

server.tool(
  'zapper_get_supported_chains',
  'Get the list of all blockchain networks supported by Zapper. Returns chain names, IDs, and native token information.',
  {},
  async () => {
    try {
      const result = await call('/apps')
      // Extract unique networks from all apps
      const apps = result as Array<Record<string, unknown>>
      const chains = new Set<string>()
      if (Array.isArray(apps)) {
        for (const app of apps) {
          const networks = app.supportedNetworks as string[] | undefined
          if (Array.isArray(networks)) {
            networks.forEach((n) => chains.add(n))
          }
        }
      }
      return successContent({
        chains: Array.from(chains).sort(),
        count: chains.size,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
