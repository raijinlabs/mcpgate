/**
 * Compound MCP Server -- Production-ready
 *
 * Provides tools to query Compound V3 protocol data via The Graph subgraph
 * (Messari standardised schema). Covers markets, positions, rates,
 * liquidations, supply data, and historical metrics.
 *
 * Tools:
 *   compound_list_markets      -- List all Compound V3 markets
 *   compound_get_market        -- Get a single market by ID
 *   compound_get_user_positions-- Get positions for a wallet address
 *   compound_get_rates         -- Get current supply/borrow rates
 *   compound_get_protocol_data -- Get aggregate protocol statistics
 *   compound_list_liquidations -- List recent liquidation events
 *   compound_get_market_history-- Get daily snapshots for a market
 *   compound_get_total_supply  -- Get total supply across all markets
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createSubgraphClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Subgraph Client
// ---------------------------------------------------------------------------

const { query, categoriseError } = createSubgraphClient({
  name: 'compound',
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/messari/compound-v3-ethereum',
  apiKeyEnvVar: 'GRAPH_API_KEY',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'compound-mcp',
  version: '0.1.0',
})

// ---- compound_list_markets ------------------------------------------------

server.tool(
  'compound_list_markets',
  'List all Compound V3 lending markets with key metrics including TVL, total borrows, rates, and utilisation. Results are paginated.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of markets to return (1-100, default 25)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of markets to skip for pagination (default 0)'),
    orderBy: z
      .string()
      .optional()
      .describe('Field to order markets by (e.g. "totalValueLockedUSD", "totalBorrowBalanceUSD")'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction: "asc" or "desc" (default "desc")'),
  },
  async ({ first, skip, orderBy, orderDirection }) => {
    try {
      const gql = `
        query ListMarkets($first: Int!, $skip: Int!, $orderBy: Market_orderBy, $orderDirection: OrderDirection) {
          markets(
            first: $first
            skip: $skip
            orderBy: $orderBy
            orderDirection: $orderDirection
          ) {
            id
            name
            inputToken {
              id
              symbol
              name
              decimals
            }
            outputToken {
              id
              symbol
              name
              decimals
            }
            totalValueLockedUSD
            totalBorrowBalanceUSD
            totalDepositBalanceUSD
            inputTokenBalance
            inputTokenPriceUSD
            rates {
              id
              rate
              side
              type
            }
            isActive
            createdTimestamp
            createdBlockNumber
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 25,
        skip: skip ?? 0,
        orderBy: orderBy ?? 'totalValueLockedUSD',
        orderDirection: orderDirection ?? 'desc',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_market --------------------------------------------------

server.tool(
  'compound_get_market',
  'Get detailed information for a single Compound V3 market by its ID. Returns TVL, rates, token info, and configuration.',
  {
    market_id: z
      .string()
      .describe('The market ID (contract address of the Compound market)'),
  },
  async ({ market_id }) => {
    try {
      const gql = `
        query GetMarket($id: ID!) {
          market(id: $id) {
            id
            name
            inputToken {
              id
              symbol
              name
              decimals
            }
            outputToken {
              id
              symbol
              name
              decimals
            }
            totalValueLockedUSD
            totalBorrowBalanceUSD
            totalDepositBalanceUSD
            inputTokenBalance
            inputTokenPriceUSD
            outputTokenSupply
            outputTokenPriceUSD
            rates {
              id
              rate
              side
              type
            }
            cumulativeSupplySideRevenueUSD
            cumulativeProtocolSideRevenueUSD
            cumulativeTotalRevenueUSD
            cumulativeDepositUSD
            cumulativeBorrowUSD
            cumulativeLiquidateUSD
            isActive
            createdTimestamp
            createdBlockNumber
            positionCount
            openPositionCount
          }
        }
      `
      const result = await query(gql, { id: market_id.toLowerCase() })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_user_positions ------------------------------------------

server.tool(
  'compound_get_user_positions',
  'Get all open lending and borrowing positions for a wallet address on Compound V3. Returns balances, collateral, and market information.',
  {
    address: z
      .string()
      .describe('Ethereum wallet address (0x...) to look up positions for'),
    first: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Max number of positions to return (default 100)'),
  },
  async ({ address, first }) => {
    try {
      const gql = `
        query GetUserPositions($account: String!, $first: Int!) {
          positions(
            where: { account: $account, hashClosed: false }
            first: $first
          ) {
            id
            account {
              id
            }
            market {
              id
              name
              inputToken {
                symbol
                decimals
              }
            }
            side
            balance
            depositCount
            withdrawCount
            borrowCount
            repayCount
            liquidationCount
            isCollateral
            hashOpened
            blockNumberOpened
            timestampOpened
          }
        }
      `
      const result = await query(gql, {
        account: address.toLowerCase(),
        first: first ?? 100,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_rates ---------------------------------------------------

server.tool(
  'compound_get_rates',
  'Get current supply and borrow interest rates for all Compound V3 markets. Returns both variable and stable rates where applicable.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of markets to return rates for (default 25)'),
  },
  async ({ first }) => {
    try {
      const gql = `
        query GetRates($first: Int!) {
          markets(first: $first, where: { isActive: true }, orderBy: totalValueLockedUSD, orderDirection: desc) {
            id
            name
            inputToken {
              symbol
              name
            }
            rates {
              id
              rate
              side
              type
            }
            totalValueLockedUSD
            totalBorrowBalanceUSD
            totalDepositBalanceUSD
          }
        }
      `
      const result = await query(gql, { first: first ?? 25 })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_protocol_data -------------------------------------------

server.tool(
  'compound_get_protocol_data',
  'Get aggregate Compound V3 protocol statistics including total TVL, total borrows, revenue, and usage metrics.',
  {},
  async () => {
    try {
      const gql = `
        query GetProtocolData {
          protocols(first: 1) {
            id
            name
            slug
            type
            totalValueLockedUSD
            cumulativeSupplySideRevenueUSD
            cumulativeProtocolSideRevenueUSD
            cumulativeTotalRevenueUSD
            cumulativeUniqueUsers
            cumulativeUniqueDepositors
            cumulativeUniqueBorrowers
            cumulativeUniqueLiquidators
            totalDepositBalanceUSD
            totalBorrowBalanceUSD
            totalPoolCount
            openPositionCount
          }
        }
      `
      const result = await query(gql)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_list_liquidations -------------------------------------------

server.tool(
  'compound_list_liquidations',
  'List recent liquidation events on Compound V3. Shows the liquidated positions, amounts seized, and debt repaid.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of liquidation events to return (default 50)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of events to skip for pagination (default 0)'),
  },
  async ({ first, skip }) => {
    try {
      const gql = `
        query ListLiquidations($first: Int!, $skip: Int!) {
          liquidates(
            first: $first
            skip: $skip
            orderBy: timestamp
            orderDirection: desc
          ) {
            id
            hash
            logIndex
            blockNumber
            timestamp
            liquidator {
              id
            }
            liquidatee {
              id
            }
            market {
              id
              name
              inputToken {
                symbol
              }
            }
            asset {
              id
              symbol
            }
            amount
            amountUSD
            profitUSD
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 50,
        skip: skip ?? 0,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_market_history ------------------------------------------

server.tool(
  'compound_get_market_history',
  'Get daily snapshots for a Compound V3 market including TVL, rates, volumes, and revenue over time.',
  {
    market_id: z
      .string()
      .describe('The market ID (contract address) to get history for'),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Number of days of history to retrieve (default 30)'),
  },
  async ({ market_id, days }) => {
    try {
      const numDays = days ?? 30
      const gql = `
        query GetMarketHistory($market: String!, $first: Int!) {
          marketDailySnapshots(
            where: { market: $market }
            first: $first
            orderBy: timestamp
            orderDirection: desc
          ) {
            id
            totalValueLockedUSD
            totalDepositBalanceUSD
            totalBorrowBalanceUSD
            dailyDepositUSD
            dailyBorrowUSD
            dailyLiquidateUSD
            dailyWithdrawUSD
            dailyRepayUSD
            dailySupplySideRevenueUSD
            dailyProtocolSideRevenueUSD
            dailyTotalRevenueUSD
            rates {
              rate
              side
              type
            }
            inputTokenBalance
            inputTokenPriceUSD
            timestamp
            blockNumber
          }
        }
      `
      const result = await query(gql, {
        market: market_id.toLowerCase(),
        first: numDays,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- compound_get_total_supply --------------------------------------------

server.tool(
  'compound_get_total_supply',
  'Get total supply (TVL) across all Compound V3 markets. Returns aggregate deposit balances and USD values.',
  {},
  async () => {
    try {
      const gql = `
        query GetTotalSupply {
          protocols(first: 1) {
            id
            name
            totalValueLockedUSD
            totalDepositBalanceUSD
            totalBorrowBalanceUSD
          }
          markets(first: 100, orderBy: totalDepositBalanceUSD, orderDirection: desc) {
            id
            name
            inputToken {
              symbol
            }
            totalDepositBalanceUSD
            totalValueLockedUSD
            inputTokenBalance
            inputTokenPriceUSD
          }
        }
      `
      const result = await query(gql)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
