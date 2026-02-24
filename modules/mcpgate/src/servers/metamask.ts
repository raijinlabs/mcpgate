/**
 * MetaMask MCP Server -- Production-ready
 *
 * Provides tools to interact with the Ethereum blockchain via JSON-RPC,
 * using Infura as the RPC provider (commonly used with MetaMask wallets).
 *
 * RPC URL: METAMASK_RPC_URL env var, or constructed from INFURA_API_KEY
 * Default: https://mainnet.infura.io/v3/{INFURA_API_KEY}
 *
 * Tools:
 *   metamask_get_accounts            -- Get accounts (returns empty for RPC)
 *   metamask_get_balance             -- Get ETH balance for an address
 *   metamask_get_chain_id            -- Get the current chain ID
 *   metamask_get_block_number        -- Get the latest block number
 *   metamask_get_transaction_receipt -- Get a transaction receipt
 *   metamask_call_contract           -- Make a read-only contract call
 *   metamask_estimate_gas            -- Estimate gas for a transaction
 *   metamask_get_gas_price           -- Get current gas price
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createJsonRpcClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// JSON-RPC Client -- Infura/Ethereum
// ---------------------------------------------------------------------------

// Build default URL from INFURA_API_KEY if METAMASK_RPC_URL is not set
const infuraKey = process.env.INFURA_API_KEY || ''
const defaultRpcUrl = infuraKey
  ? `https://mainnet.infura.io/v3/${infuraKey}`
  : undefined

const { call, categoriseError } = createJsonRpcClient({
  name: 'metamask',
  urlEnvVar: 'METAMASK_RPC_URL',
  defaultUrl: defaultRpcUrl,
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'metamask-mcp',
  version: '0.1.0',
})

// ---- metamask_get_accounts -------------------------------------------------

server.tool(
  'metamask_get_accounts',
  'Get accounts from the Ethereum node. Note: When using a public RPC provider like Infura, this returns an empty array since the node does not manage accounts.',
  {},
  async () => {
    try {
      const result = await call('eth_accounts')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_get_balance --------------------------------------------------

server.tool(
  'metamask_get_balance',
  'Get the ETH balance for an Ethereum address. Returns the balance as a hex-encoded value in wei.',
  {
    address: z.string().describe('Ethereum address (0x-prefixed, 42 characters)'),
    block: z.string().optional().describe('Block number as hex string or "latest", "earliest", "pending" (default "latest")'),
  },
  async ({ address, block }) => {
    try {
      const result = await call('eth_getBalance', [address, block || 'latest'])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_get_chain_id -------------------------------------------------

server.tool(
  'metamask_get_chain_id',
  'Get the chain ID of the connected Ethereum network. Returns a hex-encoded chain ID (e.g. "0x1" for mainnet).',
  {},
  async () => {
    try {
      const result = await call('eth_chainId')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_get_block_number ---------------------------------------------

server.tool(
  'metamask_get_block_number',
  'Get the latest block number on the Ethereum blockchain. Returns a hex-encoded block number.',
  {},
  async () => {
    try {
      const result = await call('eth_blockNumber')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_get_transaction_receipt --------------------------------------

server.tool(
  'metamask_get_transaction_receipt',
  'Get the receipt of a transaction by its hash. Returns status, gas used, logs, and contract address (if deployment).',
  {
    transactionHash: z.string().describe('Transaction hash (0x-prefixed, 66 characters)'),
  },
  async ({ transactionHash }) => {
    try {
      const result = await call('eth_getTransactionReceipt', [transactionHash])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_call_contract ------------------------------------------------

server.tool(
  'metamask_call_contract',
  'Execute a read-only (view/pure) smart contract call. Does not create a transaction or cost gas. Returns the contract function return value as hex-encoded data.',
  {
    to: z.string().describe('Contract address to call (0x-prefixed)'),
    data: z.string().describe('ABI-encoded function call data (0x-prefixed). Use tools like ethers.js to encode.'),
    from: z.string().optional().describe('Address to simulate the call from (optional)'),
    gas: z.string().optional().describe('Gas limit as hex string (optional)'),
    gasPrice: z.string().optional().describe('Gas price as hex string in wei (optional)'),
    value: z.string().optional().describe('ETH value to send as hex string in wei (optional, for payable functions)'),
    block: z.string().optional().describe('Block number as hex string or "latest" (default "latest")'),
  },
  async ({ to, data, from, gas, gasPrice, value, block }) => {
    try {
      const txObj: Record<string, string> = { to, data }
      if (from !== undefined) txObj.from = from
      if (gas !== undefined) txObj.gas = gas
      if (gasPrice !== undefined) txObj.gasPrice = gasPrice
      if (value !== undefined) txObj.value = value
      const result = await call('eth_call', [txObj, block || 'latest'])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_estimate_gas -------------------------------------------------

server.tool(
  'metamask_estimate_gas',
  'Estimate the gas required to execute a transaction. Returns the estimated gas amount as a hex-encoded value.',
  {
    to: z.string().describe('Destination address (0x-prefixed)'),
    from: z.string().optional().describe('Sender address (0x-prefixed)'),
    data: z.string().optional().describe('ABI-encoded call data (0x-prefixed)'),
    value: z.string().optional().describe('ETH value to send as hex string in wei'),
    gas: z.string().optional().describe('Gas limit as hex string (optional)'),
    gasPrice: z.string().optional().describe('Gas price as hex string in wei (optional)'),
  },
  async ({ to, from, data, value, gas, gasPrice }) => {
    try {
      const txObj: Record<string, string> = { to }
      if (from !== undefined) txObj.from = from
      if (data !== undefined) txObj.data = data
      if (value !== undefined) txObj.value = value
      if (gas !== undefined) txObj.gas = gas
      if (gasPrice !== undefined) txObj.gasPrice = gasPrice
      const result = await call('eth_estimateGas', [txObj])
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- metamask_get_gas_price ------------------------------------------------

server.tool(
  'metamask_get_gas_price',
  'Get the current gas price on the Ethereum network. Returns the gas price as a hex-encoded value in wei.',
  {},
  async () => {
    try {
      const result = await call('eth_gasPrice')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
