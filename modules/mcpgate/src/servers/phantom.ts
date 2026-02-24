/**
 * Phantom MCP Server -- Production-ready
 *
 * Provides tools to interact with the Solana blockchain via JSON-RPC,
 * modeled as a Solana RPC helper for Phantom wallet users.
 *
 * Since Phantom is primarily a browser wallet extension, this server
 * exposes Solana RPC read operations commonly needed by wallet users.
 *
 * RPC: PHANTOM_RPC_URL env var or default https://api.mainnet-beta.solana.com
 * Auth: NONE (public RPC)
 *
 * Tools:
 *   phantom_get_balance              -- Get SOL balance for an address
 *   phantom_get_account_info         -- Get account info for an address
 *   phantom_get_token_accounts       -- Get SPL token accounts for an owner
 *   phantom_get_recent_transactions  -- Get recent transaction signatures
 *   phantom_get_transaction          -- Get a specific transaction by signature
 *   phantom_get_block_height         -- Get current block height
 *   phantom_get_slot                 -- Get current slot number
 *   phantom_get_health               -- Check Solana node health
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createJsonRpcClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// JSON-RPC Client for Solana
// ---------------------------------------------------------------------------

const { call, categoriseError } = createJsonRpcClient({
  name: 'phantom',
  urlEnvVar: 'PHANTOM_RPC_URL',
  defaultUrl: 'https://api.mainnet-beta.solana.com',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'phantom-mcp',
  version: '0.1.0',
})

// ---- phantom_get_balance ---------------------------------------------------

server.tool(
  'phantom_get_balance',
  'Get the SOL balance for a Solana wallet address. Returns balance in lamports (1 SOL = 1,000,000,000 lamports).',
  {
    address: z.string().describe('Solana wallet public key (base58 encoded)'),
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level (default "finalized")'),
  },
  async ({ address, commitment }) => {
    try {
      const params: unknown[] = [address]
      if (commitment) {
        params.push({ commitment })
      }
      const result = await call('getBalance', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_account_info ----------------------------------------------

server.tool(
  'phantom_get_account_info',
  'Get detailed account information for a Solana address including lamports, owner program, data, and executable status.',
  {
    address: z.string().describe('Solana account public key (base58 encoded)'),
    encoding: z.enum(['base58', 'base64', 'base64+zstd', 'jsonParsed']).optional().describe('Data encoding format (default "base64")'),
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level'),
  },
  async ({ address, encoding, commitment }) => {
    try {
      const config: Record<string, unknown> = {}
      if (encoding) config.encoding = encoding
      if (commitment) config.commitment = commitment
      const params: unknown[] = [address]
      if (Object.keys(config).length > 0) params.push(config)
      const result = await call('getAccountInfo', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_token_accounts --------------------------------------------

server.tool(
  'phantom_get_token_accounts',
  'Get all SPL token accounts owned by a Solana wallet address. Returns token balances and mint addresses.',
  {
    owner: z.string().describe('Solana wallet public key that owns the token accounts'),
    programId: z.string().optional().describe('Token program ID (default: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA for SPL Token program)'),
    mint: z.string().optional().describe('Filter by specific token mint address'),
    encoding: z.enum(['base64', 'jsonParsed']).optional().describe('Data encoding format (default "jsonParsed")'),
  },
  async ({ owner, programId, mint, encoding }) => {
    try {
      const defaultProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
      const filter: Record<string, unknown> = mint
        ? { mint }
        : { programId: programId || defaultProgramId }
      const config: Record<string, unknown> = {
        encoding: encoding || 'jsonParsed',
      }
      const result = await call('getTokenAccountsByOwner', [owner, filter, config])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_recent_transactions ---------------------------------------

server.tool(
  'phantom_get_recent_transactions',
  'Get recent transaction signatures for a Solana wallet address. Returns an array of transaction signatures with metadata.',
  {
    address: z.string().describe('Solana wallet public key to get transactions for'),
    limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of signatures to return (1-1000, default 10)'),
    before: z.string().optional().describe('Start searching backwards from this transaction signature'),
    until: z.string().optional().describe('Search until this transaction signature is reached'),
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level'),
  },
  async ({ address, limit, before, until, commitment }) => {
    try {
      const config: Record<string, unknown> = {}
      if (limit !== undefined) config.limit = limit
      if (before !== undefined) config.before = before
      if (until !== undefined) config.until = until
      if (commitment !== undefined) config.commitment = commitment
      const params: unknown[] = [address]
      if (Object.keys(config).length > 0) params.push(config)
      const result = await call('getSignaturesForAddress', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_transaction -----------------------------------------------

server.tool(
  'phantom_get_transaction',
  'Get a specific transaction by its signature from Solana. Returns full transaction details including instructions, logs, and status.',
  {
    signature: z.string().describe('Transaction signature (base58 encoded)'),
    encoding: z.enum(['json', 'jsonParsed', 'base64', 'base58']).optional().describe('Transaction data encoding (default "jsonParsed")'),
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level'),
    maxSupportedTransactionVersion: z.number().int().optional().describe('Maximum transaction version to return (set to 0 for versioned transactions)'),
  },
  async ({ signature, encoding, commitment, maxSupportedTransactionVersion }) => {
    try {
      const config: Record<string, unknown> = {
        encoding: encoding || 'jsonParsed',
      }
      if (commitment !== undefined) config.commitment = commitment
      if (maxSupportedTransactionVersion !== undefined) {
        config.maxSupportedTransactionVersion = maxSupportedTransactionVersion
      }
      const result = await call('getTransaction', [signature, config])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_block_height ----------------------------------------------

server.tool(
  'phantom_get_block_height',
  'Get the current block height of the Solana blockchain.',
  {
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level'),
  },
  async ({ commitment }) => {
    try {
      const params: unknown[] = commitment ? [{ commitment }] : []
      const result = await call('getBlockHeight', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_slot ------------------------------------------------------

server.tool(
  'phantom_get_slot',
  'Get the current slot number of the Solana blockchain.',
  {
    commitment: z.enum(['processed', 'confirmed', 'finalized']).optional().describe('Commitment level'),
  },
  async ({ commitment }) => {
    try {
      const params: unknown[] = commitment ? [{ commitment }] : []
      const result = await call('getSlot', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- phantom_get_health ----------------------------------------------------

server.tool(
  'phantom_get_health',
  'Check the health of the Solana RPC node. Returns "ok" if healthy or an error if the node is behind.',
  {},
  async () => {
    try {
      const result = await call('getHealth')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
