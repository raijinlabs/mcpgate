/**
 * Wormhole MCP Server -- Production-ready
 *
 * Provides tools to query the Wormhole Scan API for cross-chain bridge data
 * including VAAs (Verified Action Approvals), transactions, protocol stats,
 * supported chains, token transfers, and search functionality.
 *
 * Tools:
 *   wormhole_get_vaa            -- Get a VAA by chain, emitter, and sequence
 *   wormhole_list_vaas          -- List recent VAAs with filters
 *   wormhole_get_transaction    -- Get transaction details by chain and hash
 *   wormhole_list_transactions  -- List recent transactions
 *   wormhole_get_stats          -- Get protocol-wide statistics
 *   wormhole_list_chains        -- List supported Wormhole chains
 *   wormhole_get_token_transfers-- Get token transfer data
 *   wormhole_search             -- Search Wormhole by keyword
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'wormhole',
  baseUrl: 'https://api.wormholescan.io/api/v1',
  tokenEnvVar: 'WORMHOLE_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'wormhole-mcp',
  version: '0.1.0',
})

// ---- wormhole_get_vaa -----------------------------------------------------

server.tool(
  'wormhole_get_vaa',
  'Get a specific Wormhole VAA (Verified Action Approval) by chain ID, emitter address, and sequence number. Returns the signed VAA with its payload, guardian signatures, and status.',
  {
    chain: z
      .number()
      .int()
      .describe('Wormhole chain ID (e.g. 1 for Solana, 2 for Ethereum, 4 for BSC, 5 for Polygon, 6 for Avalanche, 23 for Arbitrum, 24 for Optimism)'),
    emitter: z
      .string()
      .describe('Emitter address (hex-encoded, without 0x prefix for Wormhole format)'),
    sequence: z
      .string()
      .describe('VAA sequence number'),
  },
  async ({ chain, emitter, sequence }) => {
    try {
      const result = await call(
        `/vaas/${encodeURIComponent(String(chain))}/${encodeURIComponent(emitter)}/${encodeURIComponent(sequence)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_list_vaas ---------------------------------------------------

server.tool(
  'wormhole_list_vaas',
  'List recent Wormhole VAAs with optional filters. Returns VAA details including emitter, sequence, payload type, and guardian signatures.',
  {
    chain: z
      .number()
      .int()
      .optional()
      .describe('Filter by source Wormhole chain ID'),
    emitter: z
      .string()
      .optional()
      .describe('Filter by emitter address'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number for pagination (default 0)'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of VAAs per page (1-100, default 25)'),
    sortOrder: z
      .enum(['ASC', 'DESC'])
      .optional()
      .describe('Sort order by sequence (default "DESC")'),
  },
  async ({ chain, emitter, page, pageSize, sortOrder }) => {
    try {
      const basePath = chain && emitter
        ? `/vaas/${encodeURIComponent(String(chain))}/${encodeURIComponent(emitter)}`
        : chain
          ? `/vaas/${encodeURIComponent(String(chain))}`
          : '/vaas'

      const result = await call(basePath, {
        query: {
          page: String(page ?? 0),
          pageSize: String(pageSize ?? 25),
          sortOrder: sortOrder ?? 'DESC',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_get_transaction ---------------------------------------------

server.tool(
  'wormhole_get_transaction',
  'Get details for a specific cross-chain transaction by Wormhole chain ID and transaction hash. Returns source and destination info, token transfers, and status.',
  {
    chain: z
      .number()
      .int()
      .describe('Wormhole chain ID where the transaction originated'),
    txHash: z
      .string()
      .describe('Transaction hash on the source chain'),
  },
  async ({ chain, txHash }) => {
    try {
      const result = await call(
        `/transactions/${encodeURIComponent(String(chain))}/${encodeURIComponent(txHash)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_list_transactions -------------------------------------------

server.tool(
  'wormhole_list_transactions',
  'List recent Wormhole cross-chain transactions. Returns transaction details including source/destination chains, amounts, and statuses.',
  {
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number for pagination (default 0)'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of transactions per page (1-100, default 25)'),
    sortOrder: z
      .enum(['ASC', 'DESC'])
      .optional()
      .describe('Sort order by time (default "DESC")'),
    address: z
      .string()
      .optional()
      .describe('Filter transactions by sender or receiver address'),
  },
  async ({ page, pageSize, sortOrder, address }) => {
    try {
      const result = await call('/transactions', {
        query: {
          page: String(page ?? 0),
          pageSize: String(pageSize ?? 25),
          sortOrder: sortOrder ?? 'DESC',
          address,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_get_stats ---------------------------------------------------

server.tool(
  'wormhole_get_stats',
  'Get protocol-wide Wormhole statistics including total messages, total value transferred, active chains, and daily volume metrics.',
  {},
  async () => {
    try {
      // Wormholescan exposes /scorecards for protocol stats
      const result = await call('/scorecards')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_list_chains -------------------------------------------------

server.tool(
  'wormhole_list_chains',
  'List all blockchain networks supported by Wormhole. Returns Wormhole chain IDs, network names, and connection details.',
  {},
  async () => {
    try {
      // Derive chain list from governor config
      const result = await call('/governor/config')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_get_token_transfers -----------------------------------------

server.tool(
  'wormhole_get_token_transfers',
  'Get token transfer data across the Wormhole bridge. Returns transfer volumes, token breakdowns, and chain-pair statistics.',
  {
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number for pagination (default 0)'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of transfers per page (1-100, default 25)'),
    sourceChain: z
      .number()
      .int()
      .optional()
      .describe('Filter by source Wormhole chain ID'),
    targetChain: z
      .number()
      .int()
      .optional()
      .describe('Filter by target Wormhole chain ID'),
    address: z
      .string()
      .optional()
      .describe('Filter by sender or receiver address'),
  },
  async ({ page, pageSize, sourceChain, targetChain, address }) => {
    try {
      const result = await call('/operations', {
        query: {
          page: String(page ?? 0),
          pageSize: String(pageSize ?? 25),
          sourceChain: sourceChain !== undefined ? String(sourceChain) : undefined,
          targetChain: targetChain !== undefined ? String(targetChain) : undefined,
          address,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- wormhole_search ------------------------------------------------------

server.tool(
  'wormhole_search',
  'Search Wormhole for transactions, VAAs, or addresses by keyword. Accepts transaction hashes, addresses, or VAA IDs.',
  {
    query: z
      .string()
      .describe('Search query string (transaction hash, address, or VAA ID)'),
  },
  async ({ query: searchQuery }) => {
    try {
      const result = await call('/operations', {
        query: { address: searchQuery, pageSize: '25' },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
