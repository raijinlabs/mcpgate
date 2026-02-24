/**
 * OpenSea MCP Server -- Production-ready
 *
 * Provides tools to interact with the OpenSea API v2 for NFT marketplace data
 * including collections, NFTs, stats, events, offers, orders, and accounts.
 *
 * Tools:
 *   opensea_list_collections     -- List NFT collections
 *   opensea_get_collection       -- Get a single collection by slug
 *   opensea_list_nfts            -- List NFTs in a contract
 *   opensea_get_nft              -- Get a single NFT by contract and token ID
 *   opensea_get_collection_stats -- Get collection floor price, volume, etc.
 *   opensea_list_events          -- List events for a collection
 *   opensea_get_best_offer       -- Get best offer for an NFT
 *   opensea_list_orders          -- List orders for a chain/protocol
 *   opensea_get_account          -- Get account info by address
 *   opensea_list_traits          -- List traits for a collection
 *   opensea_get_payment_tokens   -- Get supported payment tokens
 *   opensea_search_collections   -- Search collections by keyword
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'opensea',
  baseUrl: 'https://api.opensea.io/api/v2',
  tokenEnvVar: 'OPENSEA_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'x-api-key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'opensea-mcp',
  version: '0.1.0',
})

// ---- opensea_list_collections ---------------------------------------------

server.tool(
  'opensea_list_collections',
  'List NFT collections from OpenSea. Returns collection names, slugs, stats, and metadata. Results are paginated.',
  {
    chain: z
      .string()
      .optional()
      .describe('Blockchain to filter by (e.g. "ethereum", "polygon", "arbitrum")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of collections to return (1-100, default 50)'),
    next: z
      .string()
      .optional()
      .describe('Cursor for pagination from a previous response'),
  },
  async ({ chain, limit, next }) => {
    try {
      const result = await call('/collections', {
        query: {
          chain,
          limit: String(limit ?? 50),
          next,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_collection -----------------------------------------------

server.tool(
  'opensea_get_collection',
  'Get detailed information for a single NFT collection by its OpenSea slug. Returns description, stats, fees, and links.',
  {
    slug: z
      .string()
      .describe('OpenSea collection slug (e.g. "boredapeyachtclub", "cryptopunks")'),
  },
  async ({ slug }) => {
    try {
      const result = await call(`/collections/${encodeURIComponent(slug)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_list_nfts ----------------------------------------------------

server.tool(
  'opensea_list_nfts',
  'List NFTs within a specific contract address on a given chain. Returns token IDs, names, images, and metadata.',
  {
    chain: z
      .string()
      .describe('Blockchain name (e.g. "ethereum", "polygon", "arbitrum")'),
    address: z
      .string()
      .describe('NFT contract address (0x...)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of NFTs to return (1-200, default 50)'),
    next: z
      .string()
      .optional()
      .describe('Cursor for pagination from a previous response'),
  },
  async ({ chain, address, limit, next }) => {
    try {
      const result = await call(
        `/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(address)}/nfts`,
        {
          query: {
            limit: String(limit ?? 50),
            next,
          },
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_nft ------------------------------------------------------

server.tool(
  'opensea_get_nft',
  'Get detailed data for a single NFT by chain, contract address, and token identifier. Returns metadata, traits, ownership, and listing info.',
  {
    chain: z
      .string()
      .describe('Blockchain name (e.g. "ethereum", "polygon")'),
    address: z
      .string()
      .describe('NFT contract address (0x...)'),
    identifier: z
      .string()
      .describe('Token identifier (token ID) within the contract'),
  },
  async ({ chain, address, identifier }) => {
    try {
      const result = await call(
        `/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(address)}/nfts/${encodeURIComponent(identifier)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_collection_stats -----------------------------------------

server.tool(
  'opensea_get_collection_stats',
  'Get statistics for an NFT collection including floor price, total volume, number of owners, total supply, and sales counts.',
  {
    slug: z
      .string()
      .describe('OpenSea collection slug (e.g. "boredapeyachtclub")'),
  },
  async ({ slug }) => {
    try {
      const result = await call(`/collections/${encodeURIComponent(slug)}/stats`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_list_events --------------------------------------------------

server.tool(
  'opensea_list_events',
  'List activity events for an NFT collection including sales, transfers, listings, and offers. Results are paginated.',
  {
    slug: z
      .string()
      .describe('OpenSea collection slug'),
    event_type: z
      .enum(['sale', 'transfer', 'listing', 'offer', 'cancel', 'redemption'])
      .optional()
      .describe('Filter by event type'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of events to return (1-50, default 25)'),
    next: z
      .string()
      .optional()
      .describe('Cursor for pagination from a previous response'),
    after: z
      .string()
      .optional()
      .describe('Filter events after this UTC timestamp (ISO 8601 format)'),
    before: z
      .string()
      .optional()
      .describe('Filter events before this UTC timestamp (ISO 8601 format)'),
  },
  async ({ slug, event_type, limit, next, after, before }) => {
    try {
      const result = await call(`/events/collection/${encodeURIComponent(slug)}`, {
        query: {
          event_type,
          limit: String(limit ?? 25),
          next,
          after,
          before,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_best_offer -----------------------------------------------

server.tool(
  'opensea_get_best_offer',
  'Get the current best (highest) offer for a specific NFT. Returns offer price, currency, maker address, and expiration.',
  {
    slug: z
      .string()
      .describe('OpenSea collection slug'),
    identifier: z
      .string()
      .describe('Token identifier (token ID) within the collection'),
  },
  async ({ slug, identifier }) => {
    try {
      const result = await call(
        `/offers/collection/${encodeURIComponent(slug)}/nfts/${encodeURIComponent(identifier)}/best`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_list_orders --------------------------------------------------

server.tool(
  'opensea_list_orders',
  'List active orders (offers) on OpenSea for a specific chain and protocol. Returns order details including maker, price, and expiration.',
  {
    chain: z
      .string()
      .describe('Blockchain name (e.g. "ethereum", "polygon")'),
    protocol: z
      .string()
      .optional()
      .describe('Order protocol (e.g. "seaport"). Defaults to "seaport".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of orders to return (1-50, default 25)'),
    order_by: z
      .string()
      .optional()
      .describe('Field to sort by (e.g. "created_date", "eth_price")'),
    order_direction: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction'),
  },
  async ({ chain, protocol, limit, order_by, order_direction }) => {
    try {
      const proto = protocol ?? 'seaport'
      const result = await call(
        `/orders/${encodeURIComponent(chain)}/${encodeURIComponent(proto)}/offers`,
        {
          query: {
            limit: String(limit ?? 25),
            order_by,
            order_direction,
          },
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_account --------------------------------------------------

server.tool(
  'opensea_get_account',
  'Get OpenSea account information for a wallet address including username, profile image, and bio.',
  {
    address: z
      .string()
      .describe('Wallet address (0x...) or ENS name'),
  },
  async ({ address }) => {
    try {
      const result = await call(`/accounts/${encodeURIComponent(address)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_list_traits --------------------------------------------------

server.tool(
  'opensea_list_traits',
  'List all traits (attributes) for an NFT collection. Returns trait categories and their possible values with counts.',
  {
    slug: z
      .string()
      .describe('OpenSea collection slug (e.g. "boredapeyachtclub")'),
  },
  async ({ slug }) => {
    try {
      const result = await call(`/collections/${encodeURIComponent(slug)}/traits`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_get_payment_tokens -------------------------------------------

server.tool(
  'opensea_get_payment_tokens',
  'Get the list of supported payment tokens on OpenSea including ETH, WETH, and other ERC-20 tokens accepted for trades.',
  {
    chain: z
      .string()
      .optional()
      .describe('Filter payment tokens by chain (e.g. "ethereum", "polygon")'),
  },
  async ({ chain }) => {
    try {
      const result = await call('/collections', {
        query: {
          chain,
          limit: '1',
        },
      })
      return successContent({
        note: 'Payment tokens are embedded within collection data. Query a specific collection for its payment tokens.',
        sample: result,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- opensea_search_collections -------------------------------------------

server.tool(
  'opensea_search_collections',
  'Search for NFT collections on OpenSea by keyword. Returns matching collections with their slugs, stats, and metadata.',
  {
    query: z
      .string()
      .describe('Search keyword to find collections (e.g. "ape", "punk", "azuki")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 25)'),
    next: z
      .string()
      .optional()
      .describe('Cursor for pagination from a previous response'),
  },
  async ({ query: searchQuery, limit, next }) => {
    try {
      const result = await call('/collections', {
        query: {
          limit: String(limit ?? 25),
          next,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
