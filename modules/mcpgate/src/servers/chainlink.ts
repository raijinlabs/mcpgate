/**
 * Chainlink MCP Server -- Production-ready
 *
 * Provides tools to read Chainlink price feed data via JSON-RPC calls to
 * Ethereum nodes (Alchemy/Infura). Reads on-chain aggregator contracts
 * directly using eth_call to get latest prices, round data, and feed metadata.
 *
 * Common function selectors:
 *   latestRoundData() => 0xfeaf968c
 *   decimals()        => 0x313ce567
 *   description()     => 0x7284e416
 *   latestAnswer()    => 0x50d25bcd
 *   aggregator()      => 0x245a7bfc
 *   phaseId()         => 0x58303b10
 *
 * Tools:
 *   chainlink_get_price       -- Get latest price from a feed
 *   chainlink_get_round_data  -- Get full latestRoundData from a feed
 *   chainlink_list_feeds      -- List popular Chainlink price feed addresses
 *   chainlink_get_decimals    -- Get decimal precision of a feed
 *   chainlink_get_description -- Get human-readable description of a feed
 *   chainlink_get_latest_answer -- Get raw latest answer value
 *   chainlink_get_aggregator  -- Get underlying aggregator address
 *   chainlink_get_phase_id    -- Get current phase ID of a feed
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createJsonRpcClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// JSON-RPC Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createJsonRpcClient({
  name: 'chainlink',
  urlEnvVar: 'CHAINLINK_RPC_URL',
  defaultUrl: 'https://eth-mainnet.g.alchemy.com/v2/demo',
})

// ---------------------------------------------------------------------------
// Function selectors
// ---------------------------------------------------------------------------

const SELECTORS = {
  latestRoundData: '0xfeaf968c',
  decimals: '0x313ce567',
  description: '0x7284e416',
  latestAnswer: '0x50d25bcd',
  aggregator: '0x245a7bfc',
  phaseId: '0x58303b10',
} as const

// ---------------------------------------------------------------------------
// Popular Chainlink price feed addresses (Ethereum mainnet)
// ---------------------------------------------------------------------------

const POPULAR_FEEDS: Record<string, { address: string; pair: string; decimals: number }> = {
  'ETH/USD': {
    address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    pair: 'ETH / USD',
    decimals: 8,
  },
  'BTC/USD': {
    address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    pair: 'BTC / USD',
    decimals: 8,
  },
  'LINK/USD': {
    address: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
    pair: 'LINK / USD',
    decimals: 8,
  },
  'USDC/USD': {
    address: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    pair: 'USDC / USD',
    decimals: 8,
  },
  'USDT/USD': {
    address: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
    pair: 'USDT / USD',
    decimals: 8,
  },
  'DAI/USD': {
    address: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    pair: 'DAI / USD',
    decimals: 8,
  },
  'SOL/USD': {
    address: '0x4ffC43a60e009B551865A93d232E33Fce9f01507',
    pair: 'SOL / USD',
    decimals: 8,
  },
  'DOGE/USD': {
    address: '0x2465CefD3b488BE410b941b1d4b2767088e2A028',
    pair: 'DOGE / USD',
    decimals: 8,
  },
  'MATIC/USD': {
    address: '0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676',
    pair: 'MATIC / USD',
    decimals: 8,
  },
  'AVAX/USD': {
    address: '0xFF3EEb22B5E3dE6e705b44749C2559d704923FD7',
    pair: 'AVAX / USD',
    decimals: 8,
  },
  'UNI/USD': {
    address: '0x553303d460EE0afB37EdFf9bE42922D8FF63220e',
    pair: 'UNI / USD',
    decimals: 8,
  },
  'AAVE/USD': {
    address: '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9',
    pair: 'AAVE / USD',
    decimals: 8,
  },
  'BNB/USD': {
    address: '0x14e613AC691a42F21B17A34Fd8b70fbA00068862',
    pair: 'BNB / USD',
    decimals: 8,
  },
  'ARB/USD': {
    address: '0x31697852a68433DbCc2Ff9bA924722580E9730ca',
    pair: 'ARB / USD',
    decimals: 8,
  },
  'OP/USD': {
    address: '0x0D276FC14719f9292D5C1eA2198673d1f4269246',
    pair: 'OP / USD',
    decimals: 8,
  },
  'COMP/USD': {
    address: '0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5',
    pair: 'COMP / USD',
    decimals: 8,
  },
  'MKR/USD': {
    address: '0xec1D1B3b0443256cc3860e24a46F108e699484Aa',
    pair: 'MKR / USD',
    decimals: 8,
  },
  'CRV/USD': {
    address: '0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f',
    pair: 'CRV / USD',
    decimals: 8,
  },
  'STETH/USD': {
    address: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8',
    pair: 'stETH / USD',
    decimals: 8,
  },
  'STETH/ETH': {
    address: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
    pair: 'stETH / ETH',
    decimals: 18,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute an eth_call and return the raw hex result.
 */
async function ethCall(to: string, data: string): Promise<string> {
  return call<string>('eth_call', [{ to, data }, 'latest'])
}

/**
 * Decode a uint256 from a hex string at a given 32-byte slot.
 */
function decodeUint256(hex: string, slot = 0): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const start = slot * 64
  const chunk = clean.slice(start, start + 64)
  if (!chunk) return 0n
  return BigInt('0x' + chunk)
}

/**
 * Decode an int256 from hex (two's complement).
 */
function decodeInt256(hex: string, slot = 0): bigint {
  const val = decodeUint256(hex, slot)
  const MAX_INT256 = (1n << 255n) - 1n
  if (val > MAX_INT256) {
    return val - (1n << 256n)
  }
  return val
}

/**
 * Decode a bytes string from ABI-encoded result.
 */
function decodeString(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  // ABI: offset (32 bytes) + length (32 bytes) + data
  const offset = Number(BigInt('0x' + clean.slice(0, 64))) * 2
  const length = Number(BigInt('0x' + clean.slice(offset, offset + 64)))
  const data = clean.slice(offset + 64, offset + 64 + length * 2)
  const bytes = []
  for (let i = 0; i < data.length; i += 2) {
    bytes.push(parseInt(data.slice(i, i + 2), 16))
  }
  return String.fromCharCode(...bytes)
}

/**
 * Resolve a feed pair name or address to the actual contract address.
 */
function resolveFeedAddress(feedAddressOrPair: string): string {
  // If it looks like a pair name, look it up
  const upper = feedAddressOrPair.toUpperCase().replace(/\s/g, '')
  if (POPULAR_FEEDS[upper]) {
    return POPULAR_FEEDS[upper].address
  }
  // Otherwise assume it's an address
  return feedAddressOrPair
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'chainlink-mcp',
  version: '0.1.0',
})

// ---- chainlink_get_price --------------------------------------------------

server.tool(
  'chainlink_get_price',
  'Get the latest price from a Chainlink price feed. Accepts either a feed contract address or a pair name (e.g. "ETH/USD"). Returns the human-readable price.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "ETH/USD", "BTC/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)

      // Get latestRoundData and decimals in parallel
      const [roundDataHex, decimalsHex] = await Promise.all([
        ethCall(feedAddress, SELECTORS.latestRoundData),
        ethCall(feedAddress, SELECTORS.decimals),
      ])

      const answer = decodeInt256(roundDataHex, 1)
      const decimals = Number(decodeUint256(decimalsHex))
      const price = Number(answer) / Math.pow(10, decimals)
      const updatedAt = Number(decodeUint256(roundDataHex, 3))

      return successContent({
        feed: feedAddress,
        pair: POPULAR_FEEDS[feed.toUpperCase()]?.pair ?? feed,
        price,
        rawAnswer: answer.toString(),
        decimals,
        updatedAt,
        updatedAtISO: new Date(updatedAt * 1000).toISOString(),
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_round_data ---------------------------------------------

server.tool(
  'chainlink_get_round_data',
  'Get the full latestRoundData() from a Chainlink price feed aggregator. Returns roundId, answer, startedAt, updatedAt, and answeredInRound.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "ETH/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.latestRoundData)

      const roundId = decodeUint256(hex, 0)
      const answer = decodeInt256(hex, 1)
      const startedAt = Number(decodeUint256(hex, 2))
      const updatedAt = Number(decodeUint256(hex, 3))
      const answeredInRound = decodeUint256(hex, 4)

      return successContent({
        feed: feedAddress,
        roundId: roundId.toString(),
        answer: answer.toString(),
        startedAt,
        startedAtISO: new Date(startedAt * 1000).toISOString(),
        updatedAt,
        updatedAtISO: new Date(updatedAt * 1000).toISOString(),
        answeredInRound: answeredInRound.toString(),
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_list_feeds -------------------------------------------------

server.tool(
  'chainlink_list_feeds',
  'List popular Chainlink price feed addresses on Ethereum mainnet. Returns pair names, contract addresses, and decimal precision for commonly used feeds.',
  {},
  async () => {
    try {
      const feeds = Object.entries(POPULAR_FEEDS).map(([key, val]) => ({
        pair: key,
        description: val.pair,
        address: val.address,
        decimals: val.decimals,
      }))
      return successContent({
        network: 'ethereum-mainnet',
        feeds,
        count: feeds.length,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_decimals -----------------------------------------------

server.tool(
  'chainlink_get_decimals',
  'Get the decimal precision of a Chainlink price feed. This tells you how many decimal places the price answer uses (typically 8 for USD pairs, 18 for ETH pairs).',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "ETH/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.decimals)
      const decimals = Number(decodeUint256(hex))

      return successContent({
        feed: feedAddress,
        decimals,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_description --------------------------------------------

server.tool(
  'chainlink_get_description',
  'Get the human-readable description of a Chainlink price feed (e.g. "ETH / USD"). Reads the on-chain description() function.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "BTC/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.description)
      const description = decodeString(hex)

      return successContent({
        feed: feedAddress,
        description,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_latest_answer ------------------------------------------

server.tool(
  'chainlink_get_latest_answer',
  'Get the raw latest answer value from a Chainlink price feed. Returns the raw integer value without decimal adjustment. Use chainlink_get_price for the human-readable price.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "ETH/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.latestAnswer)
      const answer = decodeInt256(hex)

      return successContent({
        feed: feedAddress,
        latestAnswer: answer.toString(),
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_aggregator ---------------------------------------------

server.tool(
  'chainlink_get_aggregator',
  'Get the underlying aggregator contract address for a Chainlink price feed proxy. The aggregator is the contract that actually stores the price data.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed proxy address (0x...) or pair name (e.g. "ETH/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.aggregator)
      // Address is in the last 20 bytes of the 32-byte return value
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex
      const aggregator = '0x' + clean.slice(24, 64)

      return successContent({
        feed: feedAddress,
        aggregator,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- chainlink_get_phase_id -----------------------------------------------

server.tool(
  'chainlink_get_phase_id',
  'Get the current phase ID of a Chainlink price feed. The phase ID changes when the underlying aggregator is upgraded.',
  {
    feed: z
      .string()
      .describe('Chainlink price feed address (0x...) or pair name (e.g. "ETH/USD")'),
  },
  async ({ feed }) => {
    try {
      const feedAddress = resolveFeedAddress(feed)
      const hex = await ethCall(feedAddress, SELECTORS.phaseId)
      const phaseId = Number(decodeUint256(hex))

      return successContent({
        feed: feedAddress,
        phaseId,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
