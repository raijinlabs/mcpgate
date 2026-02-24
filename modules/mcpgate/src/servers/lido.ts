/**
 * Lido MCP Server -- Production-ready
 *
 * Provides tools to query the Lido Finance ETH staking protocol via its
 * public REST API. Covers stETH statistics, APR, validators, withdrawals,
 * reward history, total supply, operator stats, and protocol overview.
 *
 * Tools:
 *   lido_get_steth_stats      -- Get stETH key statistics
 *   lido_get_apr              -- Get stETH APR (simple moving average)
 *   lido_get_validators       -- Get Lido validator information
 *   lido_get_withdrawals      -- Get withdrawal request data
 *   lido_get_reward_history   -- Get daily stETH rebase/reward history
 *   lido_get_total_supply     -- Get stETH total supply
 *   lido_get_operator_stats   -- Get node operator statistics
 *   lido_get_protocol_overview-- Get Lido protocol overview
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'lido',
  baseUrl: 'https://eth-api.lido.fi',
  tokenEnvVar: 'LIDO_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'lido-mcp',
  version: '0.1.0',
})

// ---- lido_get_steth_stats -------------------------------------------------

server.tool(
  'lido_get_steth_stats',
  'Get key stETH statistics from Lido including total staked ETH, market cap, number of stakers, and staking share.',
  {},
  async () => {
    try {
      const result = await call('/v1/protocol/steth/stats')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_apr ---------------------------------------------------------

server.tool(
  'lido_get_apr',
  'Get the stETH Annual Percentage Rate (APR) using a simple moving average calculation. Shows current and historical APR data.',
  {
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Number of days for the SMA window (default 7)'),
  },
  async ({ days }) => {
    try {
      const result = await call('/v1/protocol/steth/apr/sma', {
        query: {
          days: String(days ?? 7),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_validators --------------------------------------------------

server.tool(
  'lido_get_validators',
  'Get information about Lido validators including their status, balance, and performance metrics.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of validators to return (default 100)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    status: z
      .string()
      .optional()
      .describe('Filter by validator status (e.g. "active_ongoing", "pending_queued", "exited")'),
  },
  async ({ limit, offset, status }) => {
    try {
      const result = await call('/v1/validators', {
        query: {
          limit: String(limit ?? 100),
          offset: String(offset ?? 0),
          status,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_withdrawals -------------------------------------------------

server.tool(
  'lido_get_withdrawals',
  'Get stETH withdrawal request data from Lido. Shows pending and completed withdrawal requests, queue size, and estimated wait times.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of withdrawal entries to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ limit, offset }) => {
    try {
      const result = await call('/v1/protocol/steth/withdrawals', {
        query: {
          limit: String(limit ?? 50),
          offset: String(offset ?? 0),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_reward_history ----------------------------------------------

server.tool(
  'lido_get_reward_history',
  'Get daily stETH rebase and reward history from Lido. Shows the daily staking rewards distributed to stETH holders via rebases.',
  {
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Number of days of reward history to retrieve (default 30)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Maximum number of entries to return (default 30)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ days, limit, offset }) => {
    try {
      const result = await call('/v1/protocol/steth/rebase/daily', {
        query: {
          days: days !== undefined ? String(days) : undefined,
          limit: String(limit ?? 30),
          offset: String(offset ?? 0),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_total_supply ------------------------------------------------

server.tool(
  'lido_get_total_supply',
  'Get the current total supply of stETH tokens. Returns the total amount of ETH staked through Lido.',
  {},
  async () => {
    try {
      const result = await call('/v1/protocol/steth/stats')
      const data = result as Record<string, unknown>
      return successContent({
        totalSupply: data.totalStaked ?? data.totalPooledEther ?? data,
        source: 'lido-protocol-stats',
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_operator_stats ----------------------------------------------

server.tool(
  'lido_get_operator_stats',
  'Get Lido node operator statistics including active operators, total validators per operator, and performance metrics.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of operators to return (default 50)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ limit, offset }) => {
    try {
      const result = await call('/v1/operators', {
        query: {
          limit: String(limit ?? 50),
          offset: String(offset ?? 0),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- lido_get_protocol_overview -------------------------------------------

server.tool(
  'lido_get_protocol_overview',
  'Get a comprehensive Lido protocol overview including staking stats, APR, total validators, and protocol metrics in a single call.',
  {},
  async () => {
    try {
      const [stats, apr] = await Promise.all([
        call('/v1/protocol/steth/stats'),
        call('/v1/protocol/steth/apr/sma', { query: { days: '7' } }),
      ])
      return successContent({
        stats,
        apr,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
