/**
 * Etherscan MCP Server -- Production-ready
 *
 * Provides tools to interact with the Etherscan API for Ethereum blockchain
 * data. Etherscan uses a flat query-parameter style: all calls are GET requests
 * with ?module=X&action=Y&... and the API key is passed as a query param.
 *
 * CRITICAL: Etherscan returns HTTP 200 for almost everything. Errors are
 * signalled in the response body via `status: "0"` and `message: "NOTOK"`.
 * Every response is checked for body-level errors.
 *
 * Tools:
 *   etherscan_get_balance           -- Get ETH balance for an address
 *   etherscan_get_transactions      -- Get normal transactions for an address
 *   etherscan_get_token_transfers   -- Get ERC-20 token transfers
 *   etherscan_get_token_balance     -- Get ERC-20 token balance
 *   etherscan_get_contract_abi      -- Get contract ABI
 *   etherscan_get_contract_source   -- Get verified contract source code
 *   etherscan_get_gas_price         -- Get current gas oracle prices
 *   etherscan_get_block             -- Get block info by block number
 *   etherscan_get_logs              -- Get event logs by address/topics
 *   etherscan_verify_contract       -- Submit contract for verification
 *   etherscan_get_token_info        -- Get ERC-20 token metadata
 *   etherscan_get_internal_txs      -- Get internal transactions
 *   etherscan_get_erc721_transfers  -- Get ERC-721 NFT transfers
 *   etherscan_get_eth_price         -- Get current ETH price in USD/BTC
 *   etherscan_check_contract_verified -- Check if a contract is verified
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, ApiError, categoriseError } = createApiClient({
  name: 'etherscan',
  baseUrl: 'https://api.etherscan.io/api',
  tokenEnvVar: 'ETHERSCAN_API_KEY',
  authStyle: 'api-key-query',
  authHeader: 'apikey',
})

// ---------------------------------------------------------------------------
// Etherscan body-level error checker
// ---------------------------------------------------------------------------

/**
 * Etherscan returns HTTP 200 for everything. Errors are in the body:
 *   { status: "0", message: "NOTOK", result: "error description" }
 * Successful responses have status: "1".
 *
 * Some proxy module responses don't have a status field -- those return
 * raw JSON-RPC style results. We only check when status is present.
 */
function checkEtherscanBody(data: unknown): unknown {
  if (data && typeof data === 'object' && 'status' in data) {
    const body = data as Record<string, unknown>
    if (body.status === '0') {
      const msg = typeof body.result === 'string' ? body.result : String(body.message || 'Unknown error')
      // Rate limit detection
      if (msg.includes('rate limit') || msg.includes('Max rate limit')) {
        throw new ApiError({ status: 429, body: msg, retryAfterMs: 5000 })
      }
      throw new ApiError({ status: 400, body: msg })
    }
  }
  return data
}

/**
 * Wrapper around call() that validates Etherscan body-level errors.
 */
async function ethCall(
  query: Record<string, string | undefined>,
): Promise<unknown> {
  // All Etherscan calls go to the base URL with query params only (path is empty)
  const data = await call('', { query })
  return checkEtherscanBody(data)
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'etherscan-mcp',
  version: '0.1.0',
})

// ---- etherscan_get_balance -------------------------------------------------

server.tool(
  'etherscan_get_balance',
  'Get the ETH balance for an Ethereum address. Returns balance in wei.',
  {
    address: z.string().describe('Ethereum address (0x-prefixed, 42 characters)'),
    tag: z
      .enum(['latest', 'earliest', 'pending'])
      .optional()
      .describe('Block tag for the balance query (default "latest")'),
  },
  async ({ address, tag }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'balance',
        address,
        tag: tag || 'latest',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_transactions --------------------------------------------

server.tool(
  'etherscan_get_transactions',
  'Get normal (external) transactions for an Ethereum address. Results are paginated and can be filtered by block range.',
  {
    address: z.string().describe('Ethereum address to get transactions for'),
    startblock: z
      .number()
      .int()
      .optional()
      .describe('Start block number (default 0)'),
    endblock: z
      .number()
      .int()
      .optional()
      .describe('End block number (default 99999999)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number (default 1)'),
    offset: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of transactions per page (max 10000, default 10)'),
    sort: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order by block number (default "asc")'),
  },
  async ({ address, startblock, endblock, page, offset, sort }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'txlist',
        address,
        startblock: startblock !== undefined ? String(startblock) : undefined,
        endblock: endblock !== undefined ? String(endblock) : undefined,
        page: page !== undefined ? String(page) : undefined,
        offset: offset !== undefined ? String(offset) : undefined,
        sort,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_token_transfers -----------------------------------------

server.tool(
  'etherscan_get_token_transfers',
  'Get ERC-20 token transfer events for an address. Can be filtered by a specific token contract address.',
  {
    address: z.string().describe('Ethereum address to get token transfers for'),
    contractaddress: z
      .string()
      .optional()
      .describe('Filter by specific ERC-20 token contract address'),
    startblock: z
      .number()
      .int()
      .optional()
      .describe('Start block number (default 0)'),
    endblock: z
      .number()
      .int()
      .optional()
      .describe('End block number (default 99999999)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    offset: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of transfers per page (max 10000, default 10)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort order (default "asc")'),
  },
  async ({ address, contractaddress, startblock, endblock, page, offset, sort }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'tokentx',
        address,
        contractaddress,
        startblock: startblock !== undefined ? String(startblock) : undefined,
        endblock: endblock !== undefined ? String(endblock) : undefined,
        page: page !== undefined ? String(page) : undefined,
        offset: offset !== undefined ? String(offset) : undefined,
        sort,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_token_balance -------------------------------------------

server.tool(
  'etherscan_get_token_balance',
  'Get the ERC-20 token balance of an address for a specific token contract. Returns balance in the token\'s smallest unit.',
  {
    address: z.string().describe('Ethereum address to check balance for'),
    contractaddress: z.string().describe('ERC-20 token contract address'),
    tag: z
      .enum(['latest', 'earliest', 'pending'])
      .optional()
      .describe('Block tag (default "latest")'),
  },
  async ({ address, contractaddress, tag }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'tokenbalance',
        address,
        contractaddress,
        tag: tag || 'latest',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_contract_abi ---------------------------------------------

server.tool(
  'etherscan_get_contract_abi',
  'Get the ABI (Application Binary Interface) of a verified smart contract. Returns the ABI as a JSON string.',
  {
    address: z.string().describe('Contract address to retrieve ABI for'),
  },
  async ({ address }) => {
    try {
      const result = await ethCall({
        module: 'contract',
        action: 'getabi',
        address,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_contract_source -----------------------------------------

server.tool(
  'etherscan_get_contract_source',
  'Get the verified source code of a smart contract including compiler version, optimization settings, and constructor arguments.',
  {
    address: z.string().describe('Contract address to retrieve source code for'),
  },
  async ({ address }) => {
    try {
      const result = await ethCall({
        module: 'contract',
        action: 'getsourcecode',
        address,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_gas_price -----------------------------------------------

server.tool(
  'etherscan_get_gas_price',
  'Get the current Ethereum gas oracle prices including safe, proposed, and fast gas prices in Gwei.',
  {},
  async () => {
    try {
      const result = await ethCall({
        module: 'gastracker',
        action: 'gasoracle',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_block ---------------------------------------------------

server.tool(
  'etherscan_get_block',
  'Get block information by block number using the eth_getBlockByNumber proxy method. Returns full block data.',
  {
    tag: z
      .string()
      .describe('Block number as hex string (e.g. "0x10d4f") or tag ("latest", "earliest", "pending")'),
    boolean: z
      .boolean()
      .optional()
      .describe('If true, returns full transaction objects; if false, only transaction hashes (default true)'),
  },
  async ({ tag, boolean: fullTx }) => {
    try {
      const result = await ethCall({
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag,
        boolean: fullTx !== undefined ? String(fullTx) : 'true',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_logs ----------------------------------------------------

server.tool(
  'etherscan_get_logs',
  'Get event logs matching specified filter criteria. Can filter by address, topics, and block range.',
  {
    address: z.string().describe('Contract address to filter logs by'),
    fromBlock: z
      .number()
      .int()
      .optional()
      .describe('Start block number (default 0)'),
    toBlock: z
      .number()
      .int()
      .optional()
      .describe('End block number (default "latest")'),
    topic0: z
      .string()
      .optional()
      .describe('Topic 0 filter (event signature hash, e.g. keccak256 of Transfer(address,address,uint256))'),
    topic1: z.string().optional().describe('Topic 1 filter'),
    topic2: z.string().optional().describe('Topic 2 filter'),
    topic3: z.string().optional().describe('Topic 3 filter'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    offset: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of logs per page (max 10000, default 1000)'),
  },
  async ({ address, fromBlock, toBlock, topic0, topic1, topic2, topic3, page, offset }) => {
    try {
      const result = await ethCall({
        module: 'logs',
        action: 'getLogs',
        address,
        fromBlock: fromBlock !== undefined ? String(fromBlock) : undefined,
        toBlock: toBlock !== undefined ? String(toBlock) : 'latest',
        topic0,
        topic1,
        topic2,
        topic3,
        page: page !== undefined ? String(page) : undefined,
        offset: offset !== undefined ? String(offset) : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_verify_contract ---------------------------------------------

server.tool(
  'etherscan_verify_contract',
  'Submit a smart contract for source code verification on Etherscan. Returns a GUID that can be used to check verification status.',
  {
    contractaddress: z.string().describe('Contract address to verify'),
    sourceCode: z.string().describe('Solidity source code of the contract'),
    codeformat: z
      .enum(['solidity-single-file', 'solidity-standard-json-input'])
      .describe('Source code format'),
    contractname: z
      .string()
      .describe('Contract name (must match the deployed contract)'),
    compilerversion: z
      .string()
      .describe('Compiler version used (e.g. "v0.8.19+commit.7dd6d404")'),
    optimizationUsed: z
      .enum(['0', '1'])
      .describe('"0" for no optimization, "1" for optimization enabled'),
    runs: z
      .number()
      .int()
      .optional()
      .describe('Optimizer runs count (default 200)'),
    constructorArguements: z
      .string()
      .optional()
      .describe('ABI-encoded constructor arguments (hex string without 0x prefix)'),
  },
  async ({ contractaddress, sourceCode, codeformat, contractname, compilerversion, optimizationUsed, runs, constructorArguements }) => {
    try {
      const result = await ethCall({
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress,
        sourceCode,
        codeformat,
        contractname,
        compilerversion,
        optimizationUsed,
        runs: runs !== undefined ? String(runs) : undefined,
        constructorArguements,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_token_info ----------------------------------------------

server.tool(
  'etherscan_get_token_info',
  'Get metadata for an ERC-20 token including name, symbol, total supply, and decimals.',
  {
    contractaddress: z.string().describe('ERC-20 token contract address'),
  },
  async ({ contractaddress }) => {
    try {
      const result = await ethCall({
        module: 'token',
        action: 'tokeninfo',
        contractaddress,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_internal_txs --------------------------------------------

server.tool(
  'etherscan_get_internal_txs',
  'Get internal (trace) transactions for an Ethereum address. Internal transactions are triggered by contract execution.',
  {
    address: z.string().describe('Ethereum address to get internal transactions for'),
    startblock: z
      .number()
      .int()
      .optional()
      .describe('Start block number (default 0)'),
    endblock: z
      .number()
      .int()
      .optional()
      .describe('End block number (default 99999999)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    offset: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of transactions per page (max 10000, default 10)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort order (default "asc")'),
  },
  async ({ address, startblock, endblock, page, offset, sort }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'txlistinternal',
        address,
        startblock: startblock !== undefined ? String(startblock) : undefined,
        endblock: endblock !== undefined ? String(endblock) : undefined,
        page: page !== undefined ? String(page) : undefined,
        offset: offset !== undefined ? String(offset) : undefined,
        sort,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_erc721_transfers ----------------------------------------

server.tool(
  'etherscan_get_erc721_transfers',
  'Get ERC-721 (NFT) token transfer events for an address. Can be filtered by a specific NFT contract.',
  {
    address: z.string().describe('Ethereum address to get NFT transfers for'),
    contractaddress: z
      .string()
      .optional()
      .describe('Filter by specific ERC-721 contract address'),
    startblock: z.number().int().optional().describe('Start block number (default 0)'),
    endblock: z.number().int().optional().describe('End block number (default 99999999)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    offset: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Number of transfers per page (max 10000, default 10)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort order (default "asc")'),
  },
  async ({ address, contractaddress, startblock, endblock, page, offset, sort }) => {
    try {
      const result = await ethCall({
        module: 'account',
        action: 'tokennfttx',
        address,
        contractaddress,
        startblock: startblock !== undefined ? String(startblock) : undefined,
        endblock: endblock !== undefined ? String(endblock) : undefined,
        page: page !== undefined ? String(page) : undefined,
        offset: offset !== undefined ? String(offset) : undefined,
        sort,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_get_eth_price -----------------------------------------------

server.tool(
  'etherscan_get_eth_price',
  'Get the current ETH price in USD and BTC along with timestamps.',
  {},
  async () => {
    try {
      const result = await ethCall({
        module: 'stats',
        action: 'ethprice',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- etherscan_check_contract_verified -------------------------------------

server.tool(
  'etherscan_check_contract_verified',
  'Check if a smart contract is verified on Etherscan. Returns verification status and the ABI if verified.',
  {
    address: z.string().describe('Contract address to check verification status for'),
  },
  async ({ address }) => {
    try {
      const data = await call('', {
        query: {
          module: 'contract',
          action: 'getabi',
          address,
        },
      })

      // Etherscan returns status "0" with result "Contract source code not verified"
      // if the contract is unverified. We don't throw; instead we return structured info.
      if (data && typeof data === 'object' && 'status' in data) {
        const body = data as Record<string, unknown>
        if (body.status === '0') {
          const resultMsg = typeof body.result === 'string' ? body.result : ''
          if (resultMsg.includes('not verified')) {
            return successContent({
              verified: false,
              address,
              message: resultMsg,
            })
          }
          // Actual error (not just "not verified")
          checkEtherscanBody(data)
        }
      }

      return successContent({
        verified: true,
        address,
        abi: (data as Record<string, unknown>).result,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
