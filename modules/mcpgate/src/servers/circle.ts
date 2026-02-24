/**
 * Circle MCP Server -- Production-ready
 *
 * Provides tools to interact with the Circle API v1 for USDC payments,
 * transfers, wallets, and configuration. Supports both production and
 * sandbox environments via the CIRCLE_SANDBOX environment variable.
 *
 * Tools:
 *   circle_create_payout      -- Create a payout
 *   circle_get_payout         -- Get payout details by ID
 *   circle_list_payouts       -- List payouts
 *   circle_create_transfer    -- Create a transfer
 *   circle_get_transfer       -- Get transfer details by ID
 *   circle_list_transfers     -- List transfers
 *   circle_get_wallet         -- Get wallet details by ID
 *   circle_list_wallets       -- List wallets
 *   circle_create_wallet      -- Create a new wallet
 *   circle_get_configuration  -- Get account configuration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client -- Switches base URL based on CIRCLE_SANDBOX env
// ---------------------------------------------------------------------------

const isSandbox = process.env.CIRCLE_SANDBOX === 'true'
const baseUrl = isSandbox
  ? 'https://api-sandbox.circle.com/v1'
  : 'https://api.circle.com/v1'

const { call, categoriseError } = createApiClient({
  name: 'circle',
  baseUrl,
  tokenEnvVar: 'CIRCLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'circle-mcp',
  version: '0.1.0',
})

// ---- circle_create_payout -------------------------------------------------

server.tool(
  'circle_create_payout',
  'Create a Circle payout to send funds to an external bank account or blockchain address. Returns the created payout object with status.',
  {
    idempotencyKey: z
      .string()
      .describe('Unique idempotency key to prevent duplicate payouts (UUID recommended)'),
    amount: z
      .object({
        amount: z.string().describe('Payout amount as a string (e.g. "100.00")'),
        currency: z.string().describe('Currency code (e.g. "USD")'),
      })
      .describe('Amount and currency for the payout'),
    destination: z
      .object({
        type: z.enum(['wire', 'ach', 'sepa', 'blockchain']).describe('Destination type'),
        id: z.string().describe('Destination ID (bank account or blockchain address ID)'),
      })
      .describe('Payout destination details'),
    metadata: z
      .object({
        beneficiaryEmail: z.string().optional().describe('Beneficiary email address'),
      })
      .optional()
      .describe('Optional metadata for the payout'),
  },
  async ({ idempotencyKey, amount, destination, metadata }) => {
    try {
      const body: Record<string, unknown> = {
        idempotencyKey,
        amount,
        destination,
      }
      if (metadata) body.metadata = metadata

      const result = await call('/payouts', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_get_payout ----------------------------------------------------

server.tool(
  'circle_get_payout',
  'Get details for a specific Circle payout by ID. Returns status, amount, destination, and timestamps.',
  {
    payout_id: z
      .string()
      .describe('The Circle payout ID to retrieve'),
  },
  async ({ payout_id }) => {
    try {
      const result = await call(`/payouts/${encodeURIComponent(payout_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_list_payouts --------------------------------------------------

server.tool(
  'circle_list_payouts',
  'List Circle payouts with optional filters. Returns payout history with statuses, amounts, and destinations.',
  {
    status: z
      .enum(['pending', 'complete', 'failed'])
      .optional()
      .describe('Filter by payout status'),
    destination: z
      .string()
      .optional()
      .describe('Filter by destination ID'),
    type: z
      .string()
      .optional()
      .describe('Filter by destination type'),
    pageAfter: z
      .string()
      .optional()
      .describe('Pagination cursor to get results after this ID'),
    pageBefore: z
      .string()
      .optional()
      .describe('Pagination cursor to get results before this ID'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of payouts per page (1-50, default 25)'),
  },
  async ({ status, destination, type, pageAfter, pageBefore, pageSize }) => {
    try {
      const result = await call('/payouts', {
        query: {
          status,
          destination,
          type,
          pageAfter,
          pageBefore,
          pageSize: String(pageSize ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_create_transfer -----------------------------------------------

server.tool(
  'circle_create_transfer',
  'Create a Circle transfer to move funds between wallets. Returns the created transfer object with status.',
  {
    idempotencyKey: z
      .string()
      .describe('Unique idempotency key to prevent duplicate transfers (UUID recommended)'),
    source: z
      .object({
        type: z.string().describe('Source type (e.g. "wallet")'),
        id: z.string().describe('Source wallet ID'),
      })
      .describe('Transfer source details'),
    destination: z
      .object({
        type: z.enum(['wallet', 'blockchain']).describe('Destination type'),
        id: z.string().optional().describe('Destination wallet ID (for wallet type)'),
        address: z.string().optional().describe('Blockchain address (for blockchain type)'),
        chain: z.string().optional().describe('Blockchain chain (e.g. "ETH", "ALGO", "SOL")'),
      })
      .describe('Transfer destination details'),
    amount: z
      .object({
        amount: z.string().describe('Transfer amount as a string (e.g. "50.00")'),
        currency: z.string().describe('Currency code (e.g. "USD")'),
      })
      .describe('Amount and currency for the transfer'),
  },
  async ({ idempotencyKey, source, destination, amount }) => {
    try {
      const result = await call('/transfers', {
        method: 'POST',
        body: { idempotencyKey, source, destination, amount },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_get_transfer --------------------------------------------------

server.tool(
  'circle_get_transfer',
  'Get details for a specific Circle transfer by ID. Returns status, source, destination, amount, and timestamps.',
  {
    transfer_id: z
      .string()
      .describe('The Circle transfer ID to retrieve'),
  },
  async ({ transfer_id }) => {
    try {
      const result = await call(`/transfers/${encodeURIComponent(transfer_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_list_transfers ------------------------------------------------

server.tool(
  'circle_list_transfers',
  'List Circle transfers with optional filters. Returns transfer history with statuses, amounts, sources, and destinations.',
  {
    status: z
      .enum(['pending', 'complete', 'failed'])
      .optional()
      .describe('Filter by transfer status'),
    walletId: z
      .string()
      .optional()
      .describe('Filter by source wallet ID'),
    destinationWalletId: z
      .string()
      .optional()
      .describe('Filter by destination wallet ID'),
    pageAfter: z
      .string()
      .optional()
      .describe('Pagination cursor to get results after this ID'),
    pageBefore: z
      .string()
      .optional()
      .describe('Pagination cursor to get results before this ID'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of transfers per page (1-50, default 25)'),
  },
  async ({ status, walletId, destinationWalletId, pageAfter, pageBefore, pageSize }) => {
    try {
      const result = await call('/transfers', {
        query: {
          status,
          walletId,
          destinationWalletId,
          pageAfter,
          pageBefore,
          pageSize: String(pageSize ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_get_wallet ----------------------------------------------------

server.tool(
  'circle_get_wallet',
  'Get details for a specific Circle wallet by ID. Returns wallet type, balances, description, and metadata.',
  {
    wallet_id: z
      .string()
      .describe('The Circle wallet ID to retrieve'),
  },
  async ({ wallet_id }) => {
    try {
      const result = await call(`/wallets/${encodeURIComponent(wallet_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_list_wallets --------------------------------------------------

server.tool(
  'circle_list_wallets',
  'List Circle wallets associated with your account. Returns wallet IDs, types, balances, and descriptions.',
  {
    pageAfter: z
      .string()
      .optional()
      .describe('Pagination cursor to get results after this ID'),
    pageBefore: z
      .string()
      .optional()
      .describe('Pagination cursor to get results before this ID'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of wallets per page (1-50, default 25)'),
  },
  async ({ pageAfter, pageBefore, pageSize }) => {
    try {
      const result = await call('/wallets', {
        query: {
          pageAfter,
          pageBefore,
          pageSize: String(pageSize ?? 25),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_create_wallet -------------------------------------------------

server.tool(
  'circle_create_wallet',
  'Create a new Circle wallet. Returns the created wallet with its ID and initial empty balances.',
  {
    idempotencyKey: z
      .string()
      .describe('Unique idempotency key to prevent duplicate wallet creation (UUID recommended)'),
    description: z
      .string()
      .optional()
      .describe('Human-readable description for the wallet'),
  },
  async ({ idempotencyKey, description }) => {
    try {
      const body: Record<string, unknown> = { idempotencyKey }
      if (description) body.description = description

      const result = await call('/wallets', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- circle_get_configuration ---------------------------------------------

server.tool(
  'circle_get_configuration',
  'Get your Circle account configuration. Returns account settings, supported currencies, and feature flags.',
  {},
  async () => {
    try {
      const result = await call('/configuration')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
