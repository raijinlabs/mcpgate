/**
 * Aave MCP Server -- Production-ready
 *
 * Provides tools to query Aave Protocol V3 data via The Graph subgraph.
 * Covers markets, user positions, reserve data, rates, governance proposals,
 * health factors, and liquidation events.
 *
 * Tools:
 *   aave_list_markets              -- List all Aave V3 lending markets
 *   aave_get_market                -- Get a single market by reserve ID
 *   aave_get_user_positions        -- Get all positions for a user address
 *   aave_get_reserve_data          -- Get detailed reserve configuration
 *   aave_get_rates                 -- Get current borrow/supply rates
 *   aave_get_protocol_data         -- Get aggregate protocol statistics
 *   aave_list_governance_proposals -- List Aave governance proposals
 *   aave_get_proposal              -- Get a single governance proposal
 *   aave_get_user_health_factor    -- Get health factor for a user
 *   aave_list_liquidations         -- List recent liquidation events
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createSubgraphClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Subgraph Client
// ---------------------------------------------------------------------------

const { query, categoriseError } = createSubgraphClient({
  name: 'aave',
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
  apiKeyEnvVar: 'GRAPH_API_KEY',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'aave-mcp',
  version: '0.1.0',
})

// ---- aave_list_markets ----------------------------------------------------

server.tool(
  'aave_list_markets',
  'List all Aave V3 lending markets with key metrics including total liquidity, total borrows, and utilisation rate. Results are paginated.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of markets to return (1-1000, default 100)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of markets to skip for pagination (default 0)'),
    orderBy: z
      .string()
      .optional()
      .describe('Field to order by (e.g. "totalLiquidity", "totalCurrentVariableDebt"). Default "totalLiquidity".'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction: "asc" or "desc" (default "desc")'),
  },
  async ({ first, skip, orderBy, orderDirection }) => {
    try {
      const gql = `
        query ListMarkets($first: Int!, $skip: Int!, $orderBy: String, $orderDirection: String) {
          reserves(
            first: $first
            skip: $skip
            orderBy: $orderBy
            orderDirection: $orderDirection
          ) {
            id
            name
            symbol
            decimals
            underlyingAsset
            totalLiquidity
            totalCurrentVariableDebt
            totalPrincipalStableDebt
            availableLiquidity
            liquidityRate
            variableBorrowRate
            stableBorrowRate
            utilizationRate
            aToken { id }
            vToken { id }
            sToken { id }
            lastUpdateTimestamp
            isActive
            isFrozen
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 100,
        skip: skip ?? 0,
        orderBy: orderBy ?? 'totalLiquidity',
        orderDirection: orderDirection ?? 'desc',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_market ------------------------------------------------------

server.tool(
  'aave_get_market',
  'Get detailed information for a single Aave V3 market by its reserve ID. Returns configuration, rates, and supply/borrow totals.',
  {
    reserve_id: z
      .string()
      .describe('The reserve ID (typically the underlying asset address concatenated with the pool address)'),
  },
  async ({ reserve_id }) => {
    try {
      const gql = `
        query GetMarket($id: ID!) {
          reserve(id: $id) {
            id
            name
            symbol
            decimals
            underlyingAsset
            totalLiquidity
            totalCurrentVariableDebt
            totalPrincipalStableDebt
            availableLiquidity
            liquidityRate
            variableBorrowRate
            stableBorrowRate
            utilizationRate
            liquidityIndex
            variableBorrowIndex
            aToken { id }
            vToken { id }
            sToken { id }
            reserveFactor
            lastUpdateTimestamp
            isActive
            isFrozen
            borrowingEnabled
            usageAsCollateralEnabled
            baseLTVasCollateral
            reserveLiquidationThreshold
            reserveLiquidationBonus
          }
        }
      `
      const result = await query(gql, { id: reserve_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_user_positions ----------------------------------------------

server.tool(
  'aave_get_user_positions',
  'Get all lending and borrowing positions for a specific wallet address on Aave V3. Returns supply balances, borrow balances, and collateral status.',
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
        query GetUserPositions($user: String!, $first: Int!) {
          userReserves(
            where: { user: $user }
            first: $first
          ) {
            id
            reserve {
              id
              name
              symbol
              underlyingAsset
              decimals
              liquidityRate
              variableBorrowRate
            }
            currentATokenBalance
            currentVariableDebt
            currentStableDebt
            currentTotalDebt
            principalStableDebt
            scaledATokenBalance
            scaledVariableDebt
            usageAsCollateralEnabledOnUser
            lastUpdateTimestamp
          }
        }
      `
      const result = await query(gql, {
        user: address.toLowerCase(),
        first: first ?? 100,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_reserve_data ------------------------------------------------

server.tool(
  'aave_get_reserve_data',
  'Get detailed reserve configuration and parameters for an Aave V3 asset, including collateral settings, caps, and e-mode configuration.',
  {
    asset: z
      .string()
      .describe('Underlying asset contract address (0x...)'),
  },
  async ({ asset }) => {
    try {
      const gql = `
        query GetReserveData($asset: String!) {
          reserves(where: { underlyingAsset: $asset }) {
            id
            name
            symbol
            decimals
            underlyingAsset
            totalLiquidity
            totalCurrentVariableDebt
            totalPrincipalStableDebt
            availableLiquidity
            liquidityRate
            variableBorrowRate
            stableBorrowRate
            utilizationRate
            liquidityIndex
            variableBorrowIndex
            reserveFactor
            baseLTVasCollateral
            reserveLiquidationThreshold
            reserveLiquidationBonus
            borrowingEnabled
            usageAsCollateralEnabled
            isActive
            isFrozen
            supplyCap
            borrowCap
            debtCeiling
            eModeLtv
            eModeLiquidationThreshold
            eModeLiquidationBonus
            lastUpdateTimestamp
          }
        }
      `
      const result = await query(gql, { asset: asset.toLowerCase() })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_rates -------------------------------------------------------

server.tool(
  'aave_get_rates',
  'Get current supply and borrow interest rates for all Aave V3 markets. Returns APY/APR for variable and stable borrows plus the supply rate.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of reserves to return (default 100)'),
    orderBy: z
      .string()
      .optional()
      .describe('Field to order by (e.g. "liquidityRate", "variableBorrowRate")'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction (default "desc")'),
  },
  async ({ first, orderBy, orderDirection }) => {
    try {
      const gql = `
        query GetRates($first: Int!, $orderBy: String, $orderDirection: String) {
          reserves(
            first: $first
            orderBy: $orderBy
            orderDirection: $orderDirection
            where: { isActive: true }
          ) {
            id
            name
            symbol
            underlyingAsset
            liquidityRate
            variableBorrowRate
            stableBorrowRate
            utilizationRate
            totalLiquidity
            totalCurrentVariableDebt
            totalPrincipalStableDebt
            lastUpdateTimestamp
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 100,
        orderBy: orderBy ?? 'liquidityRate',
        orderDirection: orderDirection ?? 'desc',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_protocol_data -----------------------------------------------

server.tool(
  'aave_get_protocol_data',
  'Get aggregate Aave V3 protocol statistics including total value locked, total borrows, number of markets, and protocol revenue.',
  {},
  async () => {
    try {
      const gql = `
        query GetProtocolData {
          protocols(first: 1) {
            id
            pools {
              id
              totalLiquidity
              totalCurrentVariableDebt
              totalPrincipalStableDebt
              availableLiquidity
            }
          }
          reserves(first: 1000, where: { isActive: true }) {
            totalLiquidity
            totalCurrentVariableDebt
            totalPrincipalStableDebt
            availableLiquidity
            symbol
            name
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

// ---- aave_list_governance_proposals ---------------------------------------

server.tool(
  'aave_list_governance_proposals',
  'List Aave governance proposals with their status, votes, and execution details. Results are paginated and sorted by creation time.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of proposals to return (default 20)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of proposals to skip (default 0)'),
    state: z
      .string()
      .optional()
      .describe('Filter by proposal state (e.g. "Active", "Executed", "Canceled", "Queued")'),
  },
  async ({ first, skip, state }) => {
    try {
      const whereClause = state ? `, where: { state: "${state}" }` : ''
      const gql = `
        query ListProposals($first: Int!, $skip: Int!) {
          proposals(
            first: $first
            skip: $skip
            orderBy: createdTimestamp
            orderDirection: desc
            ${whereClause}
          ) {
            id
            state
            creator
            executor
            title
            shortDescription
            createdTimestamp
            startBlock
            endBlock
            executionTime
            forVotes
            againstVotes
            totalVotingSupply
            ipfsHash
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 20,
        skip: skip ?? 0,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_proposal ----------------------------------------------------

server.tool(
  'aave_get_proposal',
  'Get detailed information for a single Aave governance proposal by ID, including vote counts and execution details.',
  {
    proposal_id: z
      .string()
      .describe('The governance proposal ID'),
  },
  async ({ proposal_id }) => {
    try {
      const gql = `
        query GetProposal($id: ID!) {
          proposal(id: $id) {
            id
            state
            creator
            executor
            title
            shortDescription
            createdTimestamp
            startBlock
            endBlock
            executionTime
            forVotes
            againstVotes
            totalVotingSupply
            ipfsHash
            targets
            values
            signatures
            calldatas
          }
        }
      `
      const result = await query(gql, { id: proposal_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_get_user_health_factor ------------------------------------------

server.tool(
  'aave_get_user_health_factor',
  'Get the health factor and account summary for a user on Aave V3. A health factor below 1.0 means the position is eligible for liquidation.',
  {
    address: z
      .string()
      .describe('Ethereum wallet address (0x...) to check health factor for'),
  },
  async ({ address }) => {
    try {
      const gql = `
        query GetUserHealthFactor($user: String!) {
          users(where: { id: $user }) {
            id
            borrowedReservesCount
            unclaimedRewards
            lifetimeRewards
            reserves {
              reserve {
                symbol
                name
                underlyingAsset
                decimals
                liquidityRate
                variableBorrowRate
                baseLTVasCollateral
                reserveLiquidationThreshold
              }
              currentATokenBalance
              currentVariableDebt
              currentStableDebt
              currentTotalDebt
              usageAsCollateralEnabledOnUser
            }
          }
        }
      `
      const result = await query(gql, { user: address.toLowerCase() })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- aave_list_liquidations -----------------------------------------------

server.tool(
  'aave_list_liquidations',
  'List recent liquidation events on Aave V3. Shows which positions were liquidated, the collateral seized, and the debt repaid.',
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
    user: z
      .string()
      .optional()
      .describe('Filter liquidations by the liquidated user address'),
  },
  async ({ first, skip, user }) => {
    try {
      const whereClause = user ? `where: { user: "${user.toLowerCase()}" }` : ''
      const gql = `
        query ListLiquidations($first: Int!, $skip: Int!) {
          liquidationCalls(
            first: $first
            skip: $skip
            orderBy: timestamp
            orderDirection: desc
            ${whereClause}
          ) {
            id
            user {
              id
            }
            collateralReserve {
              symbol
              name
              underlyingAsset
            }
            principalReserve {
              symbol
              name
              underlyingAsset
            }
            collateralAmount
            principalAmount
            liquidator
            timestamp
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

export default server
