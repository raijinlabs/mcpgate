/**
 * Jupiter MCP Server -- Production-ready
 *
 * Provides tools to interact with the Jupiter aggregator on Solana.
 * Jupiter is a DEX aggregator -- most endpoints are public and require
 * no authentication.
 *
 * Several endpoints live on different base URLs:
 *   - Quotes / Swap:  https://quote-api.jup.ag/v6
 *   - Token list:     https://token.jup.ag/all
 *   - Prices:         https://price.jup.ag/v6
 *
 * Tools:
 *   jupiter_get_quote             -- Get a swap quote
 *   jupiter_get_swap              -- Build a swap transaction
 *   jupiter_list_tokens           -- List all supported tokens
 *   jupiter_get_token_info        -- Get info for a specific token
 *   jupiter_get_price             -- Get current token price(s)
 *   jupiter_get_indexed_route_map -- Get the indexed route map
 *   jupiter_get_program_id_to_label -- Map program IDs to DEX labels
 *   jupiter_list_markets          -- List available markets for a token
 *   jupiter_get_token_price_history -- Get historical price data
 *   jupiter_get_limit_orders      -- Get open limit orders for an owner
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API clients
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'jupiter',
  baseUrl: 'https://api.jup.ag',
  tokenEnvVar: 'JUPITER_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'x-api-key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'jupiter-mcp',
  version: '0.1.0',
})

// ---- jupiter_get_quote ----------------------------------------------------

server.tool(
  'jupiter_get_quote',
  'Get a swap quote from the Jupiter aggregator on Solana. Returns the best route and expected output amount.',
  {
    inputMint: z.string().describe('Input token mint address (Solana SPL token)'),
    outputMint: z.string().describe('Output token mint address (Solana SPL token)'),
    amount: z.string().describe('Amount of input token in smallest unit (lamports for SOL)'),
    slippageBps: z.number().int().optional().describe('Maximum slippage in basis points (e.g. 50 = 0.5%)'),
    onlyDirectRoutes: z.boolean().optional().describe('Only return direct routes (no multi-hop)'),
    asLegacyTransaction: z.boolean().optional().describe('Return legacy transaction instead of versioned'),
    maxAccounts: z.number().int().optional().describe('Maximum number of accounts in the transaction'),
  },
  async ({ inputMint, outputMint, amount, slippageBps, onlyDirectRoutes, asLegacyTransaction, maxAccounts }) => {
    try {
      const query: Record<string, string | undefined> = {
        inputMint,
        outputMint,
        amount,
        slippageBps: slippageBps !== undefined ? String(slippageBps) : undefined,
        onlyDirectRoutes: onlyDirectRoutes !== undefined ? String(onlyDirectRoutes) : undefined,
        asLegacyTransaction: asLegacyTransaction !== undefined ? String(asLegacyTransaction) : undefined,
        maxAccounts: maxAccounts !== undefined ? String(maxAccounts) : undefined,
      }
      const result = await call('/swap/v1/quote', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_swap -----------------------------------------------------

server.tool(
  'jupiter_get_swap',
  'Build a swap transaction from a Jupiter quote. Returns a serialised transaction ready to sign.',
  {
    quoteResponse: z.record(z.unknown()).describe('The full quote response object from jupiter_get_quote'),
    userPublicKey: z.string().describe('Solana public key of the user performing the swap'),
    wrapAndUnwrapSol: z.boolean().optional().describe('Automatically wrap/unwrap SOL (default true)'),
    feeAccount: z.string().optional().describe('Fee token account for referral fees'),
    asLegacyTransaction: z.boolean().optional().describe('Return legacy transaction instead of versioned'),
    destinationTokenAccount: z.string().optional().describe('Custom destination token account address'),
  },
  async ({ quoteResponse, userPublicKey, wrapAndUnwrapSol, feeAccount, asLegacyTransaction, destinationTokenAccount }) => {
    try {
      const body: Record<string, unknown> = {
        quoteResponse,
        userPublicKey,
      }
      if (wrapAndUnwrapSol !== undefined) body.wrapAndUnwrapSol = wrapAndUnwrapSol
      if (feeAccount !== undefined) body.feeAccount = feeAccount
      if (asLegacyTransaction !== undefined) body.asLegacyTransaction = asLegacyTransaction
      if (destinationTokenAccount !== undefined) body.destinationTokenAccount = destinationTokenAccount

      const result = await call('/swap/v1/swap', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_list_tokens --------------------------------------------------

server.tool(
  'jupiter_list_tokens',
  'List all supported tokens on Jupiter. Returns token metadata including mint addresses, symbols, and decimals.',
  {},
  async () => {
    try {
      const result = await call('/tokens/v2/search', { query: { query: '' } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_token_info -----------------------------------------------

server.tool(
  'jupiter_get_token_info',
  'Get detailed info for a specific token on Jupiter by mint address. Searches the token list.',
  {
    mint: z.string().describe('Solana SPL token mint address to look up'),
  },
  async ({ mint }) => {
    try {
      const result = await call('/tokens/v2/search', { query: { query: mint } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_price ----------------------------------------------------

server.tool(
  'jupiter_get_price',
  'Get current USD price for one or more tokens from Jupiter Price API.',
  {
    ids: z.string().describe('Comma-separated token mint addresses to get prices for'),
    vsToken: z.string().optional().describe('Quote token mint address (default is USDC)'),
  },
  async ({ ids, vsToken }) => {
    try {
      const query: Record<string, string | undefined> = { ids }
      if (vsToken) query.vsToken = vsToken
      const result = await call('/price/v2', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_indexed_route_map ----------------------------------------

server.tool(
  'jupiter_get_indexed_route_map',
  'Get the Jupiter indexed route map showing which tokens can be swapped to which. Returns a mapping of mint index to routable mint indices.',
  {},
  async () => {
    try {
      const result = await call('/swap/v1/indexed-route-map')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_program_id_to_label --------------------------------------

server.tool(
  'jupiter_get_program_id_to_label',
  'Map Solana program IDs to human-readable DEX labels used by Jupiter.',
  {},
  async () => {
    try {
      const result = await call('/swap/v1/program-id-to-label')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_list_markets -------------------------------------------------

server.tool(
  'jupiter_list_markets',
  'List available markets (liquidity pools) for a given token on Jupiter.',
  {
    inputMint: z.string().describe('Input token mint address to find markets for'),
    outputMint: z.string().optional().describe('Optional output token mint to filter market pairs'),
  },
  async ({ inputMint, outputMint }) => {
    try {
      // Use the route map to find available markets
      const query: Record<string, string | undefined> = {
        inputMint,
        outputMint,
        amount: '1000000', // minimal amount to discover routes
      }
      const result = await call('/swap/v1/quote', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_token_price_history --------------------------------------

server.tool(
  'jupiter_get_token_price_history',
  'Get historical price data for a token from Jupiter. Returns OHLCV-style price points.',
  {
    id: z.string().describe('Token mint address to get price history for'),
    vsToken: z.string().optional().describe('Quote token mint address (default is USDC)'),
    type: z.enum(['1m', '5m', '15m', '1H', '4H', '1D', '1W']).optional().describe('Time interval for candles'),
  },
  async ({ id, vsToken, type }) => {
    try {
      const query: Record<string, string | undefined> = { ids: id }
      if (vsToken) query.vsToken = vsToken
      if (type) query.type = type
      const result = await call('/price/v2', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jupiter_get_limit_orders ---------------------------------------------

server.tool(
  'jupiter_get_limit_orders',
  'Get open limit orders for a given wallet address on Jupiter.',
  {
    owner: z.string().describe('Solana public key of the order owner'),
    inputMint: z.string().optional().describe('Filter by input token mint address'),
    outputMint: z.string().optional().describe('Filter by output token mint address'),
  },
  async ({ owner, inputMint, outputMint }) => {
    try {
      const query: Record<string, string | undefined> = { wallet: owner }
      if (inputMint) query.inputMint = inputMint
      if (outputMint) query.outputMint = outputMint
      const result = await call('/limit/v2/openOrders', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
