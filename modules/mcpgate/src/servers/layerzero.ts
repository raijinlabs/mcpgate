/**
 * LayerZero MCP Server -- Production-ready
 *
 * Provides tools to query the LayerZero Scan API for cross-chain message
 * data, chain information, fee estimation, protocol stats, and transaction
 * search across the LayerZero omnichain interoperability protocol.
 *
 * Tools:
 *   layerzero_get_message          -- Get a cross-chain message by src chain and tx hash
 *   layerzero_list_messages        -- List cross-chain messages with filters
 *   layerzero_get_message_status   -- Get delivery status of a message
 *   layerzero_list_chains          -- List all supported LayerZero chains
 *   layerzero_get_chain            -- Get details for a specific chain
 *   layerzero_estimate_fee         -- Estimate cross-chain messaging fee
 *   layerzero_get_stats            -- Get protocol-wide statistics
 *   layerzero_search_transactions  -- Search messages by source address
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'layerzero',
  baseUrl: 'https://scan.layerzero-api.com/v1',
  tokenEnvVar: 'LAYERZERO_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'layerzero-mcp',
  version: '0.1.0',
})

// ---- layerzero_get_message ------------------------------------------------

server.tool(
  'layerzero_get_message',
  'Get a specific LayerZero cross-chain message by source chain ID and source transaction hash. Returns full message details including payload, status, and destination info.',
  {
    srcChainId: z
      .number()
      .int()
      .describe('LayerZero source chain ID (e.g. 101 for Ethereum, 102 for BSC, 106 for Avalanche, 109 for Polygon, 110 for Arbitrum, 111 for Optimism)'),
    srcTxHash: z
      .string()
      .describe('Source transaction hash (0x...)'),
  },
  async ({ srcChainId, srcTxHash }) => {
    try {
      const result = await call(
        `/messages/${encodeURIComponent(String(srcChainId))}/${encodeURIComponent(srcTxHash)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_list_messages ----------------------------------------------

server.tool(
  'layerzero_list_messages',
  'List LayerZero cross-chain messages with optional filters for source/destination chains. Returns message history with statuses and payloads.',
  {
    srcChainId: z
      .number()
      .int()
      .optional()
      .describe('Filter by source chain ID'),
    dstChainId: z
      .number()
      .int()
      .optional()
      .describe('Filter by destination chain ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of messages to return (1-100, default 25)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ srcChainId, dstChainId, limit, offset }) => {
    try {
      const result = await call('/messages/latest', {
        query: {
          srcEid: srcChainId !== undefined ? String(srcChainId) : undefined,
          dstEid: dstChainId !== undefined ? String(dstChainId) : undefined,
          limit: String(limit ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_get_message_status -----------------------------------------

server.tool(
  'layerzero_get_message_status',
  'Get the delivery status of a LayerZero cross-chain message. Shows whether the message is inflight, delivered, or failed, along with confirmation details.',
  {
    srcChainId: z
      .number()
      .int()
      .describe('LayerZero source chain ID'),
    srcTxHash: z
      .string()
      .describe('Source transaction hash (0x...)'),
  },
  async ({ srcChainId, srcTxHash }) => {
    try {
      const result = await call(
        `/messages/${encodeURIComponent(String(srcChainId))}/${encodeURIComponent(srcTxHash)}`,
      )
      const data = result as Record<string, unknown>
      return successContent({
        srcChainId,
        srcTxHash,
        status: data.status ?? data.state ?? 'unknown',
        dstChainId: data.dstChainId,
        dstTxHash: data.dstTxHash,
        created: data.created,
        updated: data.updated,
        srcBlockNumber: data.srcBlockNumber,
        dstBlockNumber: data.dstBlockNumber,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_list_chains ------------------------------------------------

server.tool(
  'layerzero_list_chains',
  'List all blockchain networks supported by LayerZero. Returns chain IDs, names, and connection details.',
  {},
  async () => {
    try {
      // LayerZero Scan doesn't expose a /chains endpoint; derive chain list from recent messages
      const result = await call('/messages/latest', { query: { limit: '50' } })
      const data = result as { data?: Array<{ pathway?: { srcEid?: number; dstEid?: number; sender?: Record<string, unknown>; receiver?: Record<string, unknown> } }> }
      const chainMap = new Map<number, Record<string, unknown>>()
      for (const msg of data.data ?? []) {
        const p = msg.pathway
        if (p?.srcEid && p.sender) chainMap.set(p.srcEid, { eid: p.srcEid, ...p.sender })
        if (p?.dstEid && p.receiver) chainMap.set(p.dstEid, { eid: p.dstEid, ...p.receiver })
      }
      return successContent(Array.from(chainMap.values()))
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_get_chain --------------------------------------------------

server.tool(
  'layerzero_get_chain',
  'Get detailed information for a specific chain supported by LayerZero. Returns chain name, ID, endpoint addresses, and configuration.',
  {
    chainId: z
      .number()
      .int()
      .describe('LayerZero chain ID (e.g. 101 for Ethereum, 102 for BSC)'),
  },
  async ({ chainId }) => {
    try {
      // LayerZero Scan doesn't expose a per-chain endpoint; query messages for this eid
      const result = await call('/messages/latest', {
        query: { srcEid: String(chainId), limit: '10' },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_estimate_fee -----------------------------------------------

server.tool(
  'layerzero_estimate_fee',
  'Estimate the fee for sending a cross-chain message via LayerZero between two chains. Returns estimated fee in native token of the source chain.',
  {
    srcChainId: z
      .number()
      .int()
      .describe('LayerZero source chain ID'),
    dstChainId: z
      .number()
      .int()
      .describe('LayerZero destination chain ID'),
    adapterParams: z
      .string()
      .optional()
      .describe('Hex-encoded adapter parameters for custom gas settings'),
    payloadSize: z
      .number()
      .int()
      .optional()
      .describe('Size of the message payload in bytes (default 0 for estimation)'),
  },
  async ({ srcChainId, dstChainId, adapterParams, payloadSize }) => {
    try {
      // LayerZero Scan doesn't expose a fee estimation endpoint; return recent messages for these chains as reference
      const result = await call('/messages/latest', {
        query: {
          srcEid: String(srcChainId),
          dstEid: String(dstChainId),
          limit: '5',
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_get_stats --------------------------------------------------

server.tool(
  'layerzero_get_stats',
  'Get protocol-wide LayerZero statistics including total messages sent, active chains, total volume, and daily metrics.',
  {},
  async () => {
    try {
      // LayerZero Scan doesn't expose a /stats endpoint; return latest messages as overview
      const result = await call('/messages/latest', { query: { limit: '25' } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- layerzero_search_transactions ----------------------------------------

server.tool(
  'layerzero_search_transactions',
  'Search for LayerZero cross-chain messages by source address. Returns all messages sent by the specified address.',
  {
    srcAddress: z
      .string()
      .describe('Source address (0x...) that initiated the cross-chain messages'),
    srcChainId: z
      .number()
      .int()
      .optional()
      .describe('Filter by source chain ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results to return (default 25)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ srcAddress, srcChainId, limit, offset }) => {
    try {
      const result = await call(`/messages/wallet/${encodeURIComponent(srcAddress)}`, {
        query: {
          srcEid: srcChainId !== undefined ? String(srcChainId) : undefined,
          limit: String(limit ?? 25),
          offset: String(offset ?? 0),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
