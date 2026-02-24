/**
 * Alchemy MCP Server -- Production-ready
 *
 * Provides tools for Ethereum blockchain interaction via Alchemy's JSON-RPC
 * and Enhanced REST APIs. Supports standard Ethereum RPC methods and Alchemy's
 * proprietary enhanced endpoints for NFTs, tokens, and transfers.
 *
 * Configuration:
 *   ALCHEMY_API_KEY   -- Alchemy API key (required)
 *   ALCHEMY_NETWORK   -- Network name (default: "eth-mainnet")
 *
 * Tools (JSON-RPC):
 *   alchemy_get_balance           -- Get ETH balance (eth_getBalance)
 *   alchemy_get_block             -- Get block by number (eth_getBlockByNumber)
 *   alchemy_get_transaction_receipt -- Get tx receipt (eth_getTransactionReceipt)
 *   alchemy_get_logs              -- Get event logs (eth_getLogs)
 *   alchemy_call_contract         -- Call contract read fn (eth_call)
 *   alchemy_estimate_gas          -- Estimate gas (eth_estimateGas)
 *
 * Tools (Enhanced APIs via RPC or REST):
 *   alchemy_get_token_balances    -- Get ERC-20 token balances
 *   alchemy_get_nfts_for_owner    -- Get NFTs owned by address
 *   alchemy_get_nft_metadata      -- Get metadata for a specific NFT
 *   alchemy_get_asset_transfers   -- Get historical asset transfers
 *   alchemy_get_token_metadata    -- Get ERC-20 token metadata
 *   alchemy_get_floor_price       -- Get NFT collection floor price
 *   alchemy_get_owners_for_nft    -- Get owners of a specific NFT
 *   alchemy_get_contracts_for_owner -- Get NFT contracts owned by address
 *   alchemy_get_transactions      -- Get transaction receipts for a block
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createJsonRpcClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || ''
const ALCHEMY_NETWORK = process.env.ALCHEMY_NETWORK || 'eth-mainnet'

function getBaseUrl(): string {
  if (!ALCHEMY_API_KEY) {
    throw new Error('Alchemy API key not configured. Set ALCHEMY_API_KEY or connect via /v1/auth/connect/alchemy')
  }
  return `https://${ALCHEMY_NETWORK}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
}

// ---------------------------------------------------------------------------
// JSON-RPC Client
//
// We use a custom env var approach: store the full URL in a synthetic env var
// so createJsonRpcClient can pick it up. We set it lazily.
// ---------------------------------------------------------------------------

const RPC_URL_ENV = 'ALCHEMY_RPC_URL_INTERNAL'

function ensureRpcUrl(): void {
  if (!process.env[RPC_URL_ENV]) {
    process.env[RPC_URL_ENV] = getBaseUrl()
  }
}

const { call: rpcCall, categoriseError } = createJsonRpcClient({
  name: 'alchemy',
  urlEnvVar: RPC_URL_ENV,
})

/**
 * Wrapper that ensures the RPC URL is set before making a call.
 */
async function rpc<T = unknown>(method: string, params: unknown[] | Record<string, unknown> = []): Promise<T> {
  ensureRpcUrl()
  return rpcCall<T>(method, params)
}

// ---------------------------------------------------------------------------
// Enhanced API helpers (REST-style, but served from the same base URL)
// ---------------------------------------------------------------------------

async function enhancedGet(path: string, query?: Record<string, string | undefined>): Promise<unknown> {
  const base = getBaseUrl()
  const url = new URL(`${base}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Alchemy Enhanced API error (${res.status}): ${body}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'alchemy-mcp',
  version: '0.1.0',
})

// ===================== JSON-RPC Tools ======================================

// ---- alchemy_get_balance ---------------------------------------------------

server.tool(
  'alchemy_get_balance',
  'Get the ETH balance of an address. Returns balance in hex-encoded wei.',
  {
    address: z.string().describe('Ethereum address (0x-prefixed)'),
    block: z
      .string()
      .optional()
      .describe('Block number as hex string or tag ("latest", "earliest", "pending"). Defaults to "latest".'),
  },
  async ({ address, block }) => {
    try {
      const result = await rpc('eth_getBalance', [address, block || 'latest'])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_block -----------------------------------------------------

server.tool(
  'alchemy_get_block',
  'Get block information by block number. Returns full block data including transactions.',
  {
    block_number: z
      .string()
      .describe('Block number as hex string (e.g. "0x10d4f") or tag ("latest", "earliest", "pending")'),
    full_transactions: z
      .boolean()
      .optional()
      .describe('If true, returns full transaction objects; if false, only hashes (default false)'),
  },
  async ({ block_number, full_transactions }) => {
    try {
      const result = await rpc('eth_getBlockByNumber', [block_number, full_transactions ?? false])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_transaction_receipt ---------------------------------------

server.tool(
  'alchemy_get_transaction_receipt',
  'Get the receipt of a transaction by its hash. Returns status, gas used, logs, and contract address if applicable.',
  {
    tx_hash: z.string().describe('Transaction hash (0x-prefixed, 66 characters)'),
  },
  async ({ tx_hash }) => {
    try {
      const result = await rpc('eth_getTransactionReceipt', [tx_hash])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_logs ------------------------------------------------------

server.tool(
  'alchemy_get_logs',
  'Get event logs matching a filter. Can filter by address, topics, and block range.',
  {
    address: z
      .string()
      .optional()
      .describe('Contract address to filter logs (0x-prefixed)'),
    topics: z
      .array(z.string().nullable())
      .optional()
      .describe('Array of topic filters (null for wildcard). Topic 0 is typically the event signature hash.'),
    fromBlock: z
      .string()
      .optional()
      .describe('Start block as hex or tag (default "latest")'),
    toBlock: z
      .string()
      .optional()
      .describe('End block as hex or tag (default "latest")'),
  },
  async ({ address, topics, fromBlock, toBlock }) => {
    try {
      const filter: Record<string, unknown> = {}
      if (address) filter.address = address
      if (topics) filter.topics = topics
      if (fromBlock) filter.fromBlock = fromBlock
      if (toBlock) filter.toBlock = toBlock
      const result = await rpc('eth_getLogs', [filter])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_call_contract -------------------------------------------------

server.tool(
  'alchemy_call_contract',
  'Execute a read-only contract call (eth_call). Use this to read data from smart contracts without sending a transaction.',
  {
    to: z.string().describe('Contract address to call (0x-prefixed)'),
    data: z.string().describe('ABI-encoded function call data (0x-prefixed hex)'),
    from: z
      .string()
      .optional()
      .describe('Sender address for the call context (optional)'),
    block: z
      .string()
      .optional()
      .describe('Block number as hex or tag (default "latest")'),
  },
  async ({ to, data, from, block }) => {
    try {
      const txObj: Record<string, string> = { to, data }
      if (from) txObj.from = from
      const result = await rpc('eth_call', [txObj, block || 'latest'])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_estimate_gas --------------------------------------------------

server.tool(
  'alchemy_estimate_gas',
  'Estimate the gas required for a transaction. Returns the estimated gas amount in hex.',
  {
    to: z.string().describe('Destination address (0x-prefixed)'),
    from: z
      .string()
      .optional()
      .describe('Sender address (optional)'),
    data: z
      .string()
      .optional()
      .describe('Transaction data (0x-prefixed hex, optional)'),
    value: z
      .string()
      .optional()
      .describe('ETH value to send in hex-encoded wei (optional)'),
  },
  async ({ to, from, data, value }) => {
    try {
      const txObj: Record<string, string> = { to }
      if (from) txObj.from = from
      if (data) txObj.data = data
      if (value) txObj.value = value
      const result = await rpc('eth_estimateGas', [txObj])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ===================== Enhanced API Tools ===================================

// ---- alchemy_get_token_balances --------------------------------------------

server.tool(
  'alchemy_get_token_balances',
  'Get ERC-20 token balances for an address. Returns all token balances or balances for specific contracts.',
  {
    address: z.string().describe('Ethereum address to get token balances for (0x-prefixed)'),
    contractAddresses: z
      .array(z.string())
      .optional()
      .describe('Array of specific ERC-20 contract addresses to check. If omitted, returns all tokens.'),
  },
  async ({ address, contractAddresses }) => {
    try {
      const params: unknown[] = contractAddresses
        ? [address, contractAddresses]
        : [address, 'erc20']
      const result = await rpc('alchemy_getTokenBalances', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_nfts_for_owner --------------------------------------------

server.tool(
  'alchemy_get_nfts_for_owner',
  'Get all NFTs owned by an address. Returns NFT metadata, token IDs, and collection info. Results are paginated.',
  {
    owner: z.string().describe('Ethereum address of the NFT owner (0x-prefixed)'),
    pageKey: z
      .string()
      .optional()
      .describe('Pagination key from a previous response to get the next page'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of NFTs per page (1-100, default 100)'),
    contractAddresses: z
      .array(z.string())
      .optional()
      .describe('Filter by specific NFT contract addresses'),
  },
  async ({ owner, pageKey, pageSize, contractAddresses }) => {
    try {
      const query: Record<string, string | undefined> = { owner }
      if (pageKey) query.pageKey = pageKey
      if (pageSize !== undefined) query.pageSize = String(pageSize)
      if (contractAddresses && contractAddresses.length > 0) {
        query['contractAddresses[]'] = contractAddresses.join(',')
      }
      const result = await enhancedGet('/getNFTsForOwner', query)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_nft_metadata ----------------------------------------------

server.tool(
  'alchemy_get_nft_metadata',
  'Get metadata for a specific NFT including name, description, image URL, and attributes.',
  {
    contractAddress: z.string().describe('NFT contract address (0x-prefixed)'),
    tokenId: z.string().describe('Token ID of the NFT'),
    tokenType: z
      .enum(['ERC721', 'ERC1155'])
      .optional()
      .describe('Token standard type (auto-detected if not provided)'),
  },
  async ({ contractAddress, tokenId, tokenType }) => {
    try {
      const query: Record<string, string | undefined> = {
        contractAddress,
        tokenId,
        tokenType,
      }
      const result = await enhancedGet('/getNFTMetadata', query)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_asset_transfers -------------------------------------------

server.tool(
  'alchemy_get_asset_transfers',
  'Get historical asset transfers (ETH, ERC-20, ERC-721, ERC-1155) for an address. Supports filtering by category and block range.',
  {
    fromAddress: z
      .string()
      .optional()
      .describe('Sender address to filter by'),
    toAddress: z
      .string()
      .optional()
      .describe('Recipient address to filter by'),
    fromBlock: z
      .string()
      .optional()
      .describe('Start block as hex (default "0x0")'),
    toBlock: z
      .string()
      .optional()
      .describe('End block as hex or "latest"'),
    category: z
      .array(z.enum(['external', 'internal', 'erc20', 'erc721', 'erc1155', 'specialnft']))
      .describe('Transfer categories to include (e.g. ["external", "erc20"])'),
    maxCount: z
      .number()
      .int()
      .optional()
      .describe('Maximum number of results to return (default 1000, max 1000)'),
    pageKey: z
      .string()
      .optional()
      .describe('Pagination key from a previous response'),
    order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order (default "asc")'),
  },
  async ({ fromAddress, toAddress, fromBlock, toBlock, category, maxCount, pageKey, order }) => {
    try {
      const params: Record<string, unknown> = { category }
      if (fromAddress) params.fromAddress = fromAddress
      if (toAddress) params.toAddress = toAddress
      if (fromBlock) params.fromBlock = fromBlock
      if (toBlock) params.toBlock = toBlock
      if (maxCount !== undefined) params.maxCount = `0x${maxCount.toString(16)}`
      if (pageKey) params.pageKey = pageKey
      if (order) params.order = order
      const result = await rpc('alchemy_getAssetTransfers', [params])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_token_metadata --------------------------------------------

server.tool(
  'alchemy_get_token_metadata',
  'Get metadata for an ERC-20 token including name, symbol, decimals, and logo URL.',
  {
    contractAddress: z.string().describe('ERC-20 token contract address (0x-prefixed)'),
  },
  async ({ contractAddress }) => {
    try {
      const result = await rpc('alchemy_getTokenMetadata', [contractAddress])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_floor_price -----------------------------------------------

server.tool(
  'alchemy_get_floor_price',
  'Get the floor price of an NFT collection from major marketplaces (OpenSea, LooksRare).',
  {
    contractAddress: z.string().describe('NFT collection contract address (0x-prefixed)'),
  },
  async ({ contractAddress }) => {
    try {
      const result = await enhancedGet('/getFloorPrice', { contractAddress })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_owners_for_nft --------------------------------------------

server.tool(
  'alchemy_get_owners_for_nft',
  'Get the current owners of a specific NFT. For ERC-1155 tokens, may return multiple owners.',
  {
    contractAddress: z.string().describe('NFT contract address (0x-prefixed)'),
    tokenId: z.string().describe('Token ID of the NFT'),
  },
  async ({ contractAddress, tokenId }) => {
    try {
      const result = await enhancedGet('/getOwnersForNFT', { contractAddress, tokenId })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_contracts_for_owner ---------------------------------------

server.tool(
  'alchemy_get_contracts_for_owner',
  'Get all NFT contracts/collections owned by an address. Returns contract metadata and token counts.',
  {
    owner: z.string().describe('Ethereum address of the owner (0x-prefixed)'),
    pageKey: z
      .string()
      .optional()
      .describe('Pagination key from a previous response'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of contracts per page (1-100, default 100)'),
  },
  async ({ owner, pageKey, pageSize }) => {
    try {
      const query: Record<string, string | undefined> = { owner }
      if (pageKey) query.pageKey = pageKey
      if (pageSize !== undefined) query.pageSize = String(pageSize)
      const result = await enhancedGet('/getContractsForOwner', query)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- alchemy_get_transactions ----------------------------------------------

server.tool(
  'alchemy_get_transactions',
  'Get all transaction receipts for a given block. Returns an array of full receipt objects including logs.',
  {
    blockNumber: z
      .string()
      .optional()
      .describe('Block number as hex string (e.g. "0x10d4f"). Provide either blockNumber or blockHash.'),
    blockHash: z
      .string()
      .optional()
      .describe('Block hash (0x-prefixed). Provide either blockNumber or blockHash.'),
  },
  async ({ blockNumber, blockHash }) => {
    try {
      const params: Record<string, string> = {}
      if (blockNumber) params.blockNumber = blockNumber
      if (blockHash) params.blockHash = blockHash
      const result = await rpc('alchemy_getTransactionReceipts', [params])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
