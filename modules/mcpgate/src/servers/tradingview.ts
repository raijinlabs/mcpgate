/**
 * TradingView MCP Server -- Production-ready
 *
 * Provides tools to interact with TradingView's public scanner endpoints
 * for market screening, symbol search, and technical analysis data.
 *
 * NOTE: These are unofficial public endpoints. No API key required.
 *
 * Scanner endpoints:
 *   - Crypto:  https://scanner.tradingview.com/crypto/scan
 *   - Forex:   https://scanner.tradingview.com/forex/scan
 *   - Stocks:  https://scanner.tradingview.com/america/scan
 *   - Search:  https://symbol-search.tradingview.com/symbol_search/v3/
 *
 * Tools:
 *   tv_scan_market          -- Scan crypto markets with filter criteria
 *   tv_search_symbol        -- Search for symbols across exchanges
 *   tv_get_technicals       -- Get technical analysis indicators for symbols
 *   tv_get_screener_results -- Run a custom screener query
 *   tv_get_crypto_screener  -- Scan crypto markets with columns
 *   tv_get_forex_screener   -- Scan forex markets with columns
 *   tv_get_stock_screener   -- Scan US stock markets with columns
 *   tv_get_indicators       -- Get technical indicators (RSI, MACD, etc.)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Custom fetch helpers -- TradingView has no official API, uses public scanner
// ---------------------------------------------------------------------------

function categoriseError(err: unknown): { message: string; hint: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
    return { message, hint: 'TradingView rate limit hit. Reduce request frequency.' }
  }
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return { message, hint: 'TradingView scanner is experiencing issues. Please try again shortly.' }
  }
  return { message, hint: '' }
}

async function scannerPost(url: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TradingView scanner error (${res.status}): ${text}`)
  }
  return res.json()
}

async function searchGet(params: Record<string, string | undefined>): Promise<unknown> {
  const qp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qp.set(k, v)
  }
  const url = `https://symbol-search.tradingview.com/symbol_search/v3/?${qp.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TradingView search error (${res.status}): ${text}`)
  }
  return res.json()
}

// Default columns for market overview
const DEFAULT_COLUMNS = [
  'name', 'close', 'change', 'change_abs', 'high', 'low', 'volume',
  'market_cap_basic', 'description', 'type', 'subtype', 'exchange',
]

// Technical analysis columns
const TA_COLUMNS = [
  'name', 'close', 'Recommend.All', 'Recommend.MA', 'Recommend.Other',
  'RSI', 'RSI[1]', 'Stoch.K', 'Stoch.D', 'Stoch.K[1]', 'Stoch.D[1]',
  'CCI20', 'CCI20[1]', 'ADX', 'ADX+DI', 'ADX-DI', 'ADX+DI[1]', 'ADX-DI[1]',
  'AO', 'AO[1]', 'Mom', 'Mom[1]', 'MACD.macd', 'MACD.signal',
  'Rec.Stoch.RSI', 'Rec.WR', 'Rec.BBPower', 'Rec.UO', 'W.R', 'UO',
  'EMA10', 'SMA10', 'EMA20', 'SMA20', 'EMA30', 'SMA30', 'EMA50', 'SMA50',
  'EMA100', 'SMA100', 'EMA200', 'SMA200', 'BB.lower', 'BB.upper',
  'Pivot.M.Classic.S3', 'Pivot.M.Classic.S2', 'Pivot.M.Classic.S1',
  'Pivot.M.Classic.Middle', 'Pivot.M.Classic.R1', 'Pivot.M.Classic.R2',
  'Pivot.M.Classic.R3',
]

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'tradingview-mcp',
  version: '0.1.0',
})

// ---- tv_scan_market --------------------------------------------------------

server.tool(
  'tv_scan_market',
  'Scan crypto markets on TradingView using filter criteria. Returns market data with configurable columns.',
  {
    symbols: z.array(z.string()).optional().describe('List of symbols to scan (e.g. ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]). If omitted, scans all crypto.'),
    columns: z.array(z.string()).optional().describe('Columns to return (e.g. ["name", "close", "change", "volume"]). Defaults to standard market data columns.'),
    filter: z.array(z.object({
      left: z.string().describe('Column name to filter on'),
      operation: z.string().describe('Filter operation (e.g. "greater", "less", "equal", "in_range", "not_in_range")'),
      right: z.union([z.string(), z.number(), z.array(z.number())]).describe('Filter value(s)'),
    })).optional().describe('Array of filter conditions to apply'),
    sort: z.object({
      sortBy: z.string().describe('Column name to sort by'),
      sortOrder: z.enum(['asc', 'desc']).describe('Sort order'),
    }).optional().describe('Sort configuration'),
    range: z.array(z.number()).optional().describe('Result range as [start, end] (e.g. [0, 50])'),
  },
  async ({ symbols, columns, filter, sort, range }) => {
    try {
      const body: Record<string, unknown> = {
        columns: columns || DEFAULT_COLUMNS,
      }
      if (symbols) {
        body.symbols = { tickers: symbols }
      }
      if (filter) body.filter = filter
      if (sort) body.sort = sort
      if (range) body.range = range
      const result = await scannerPost('https://scanner.tradingview.com/crypto/scan', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_search_symbol ------------------------------------------------------

server.tool(
  'tv_search_symbol',
  'Search for trading symbols on TradingView by name or ticker across all or specific exchanges.',
  {
    text: z.string().describe('Search query (e.g. "BTCUSD", "Apple", "EURUSD")'),
    exchange: z.string().optional().describe('Filter by exchange (e.g. "BINANCE", "NASDAQ", "NYSE", "FOREX")'),
    type: z.string().optional().describe('Filter by symbol type (e.g. "crypto", "stock", "forex", "index", "futures")'),
    lang: z.string().optional().describe('Response language (default "en")'),
  },
  async ({ text, exchange, type, lang }) => {
    try {
      const result = await searchGet({
        text,
        exchange,
        type,
        lang: lang || 'en',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_technicals -----------------------------------------------------

server.tool(
  'tv_get_technicals',
  'Get technical analysis data for specific symbols from TradingView, including recommendation scores, RSI, MACD, moving averages, and pivot points.',
  {
    symbols: z.array(z.string()).describe('List of symbols (e.g. ["BINANCE:BTCUSDT", "NASDAQ:AAPL"])'),
    screener: z.enum(['crypto', 'forex', 'america', 'europe', 'asia']).optional().describe('Market screener to use (default "crypto")'),
  },
  async ({ symbols, screener }) => {
    try {
      const scannerUrl = `https://scanner.tradingview.com/${screener || 'crypto'}/scan`
      const body = {
        symbols: { tickers: symbols },
        columns: TA_COLUMNS,
      }
      const result = await scannerPost(scannerUrl, body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_screener_results -----------------------------------------------

server.tool(
  'tv_get_screener_results',
  'Run a custom screener query on TradingView with full control over market, columns, filters, and sorting.',
  {
    market: z.enum(['crypto', 'forex', 'america', 'europe', 'asia', 'australia', 'canada', 'india']).describe('Market/screener to query'),
    columns: z.array(z.string()).describe('Columns to return in results'),
    filter: z.array(z.object({
      left: z.string().describe('Column name to filter on'),
      operation: z.string().describe('Filter operation'),
      right: z.union([z.string(), z.number(), z.array(z.number())]).describe('Filter value(s)'),
    })).optional().describe('Array of filter conditions'),
    sort: z.object({
      sortBy: z.string().describe('Column name to sort by'),
      sortOrder: z.enum(['asc', 'desc']).describe('Sort order'),
    }).optional().describe('Sort configuration'),
    range: z.array(z.number()).optional().describe('Result range as [start, end]'),
    symbols: z.array(z.string()).optional().describe('Specific symbols to query'),
  },
  async ({ market, columns, filter, sort, range, symbols }) => {
    try {
      const body: Record<string, unknown> = { columns }
      if (filter) body.filter = filter
      if (sort) body.sort = sort
      if (range) body.range = range
      if (symbols) body.symbols = { tickers: symbols }
      const result = await scannerPost(`https://scanner.tradingview.com/${market}/scan`, body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_crypto_screener ------------------------------------------------

server.tool(
  'tv_get_crypto_screener',
  'Scan cryptocurrency markets on TradingView with configurable columns and optional filters.',
  {
    columns: z.array(z.string()).optional().describe('Columns to return (defaults to standard market data columns)'),
    range: z.array(z.number()).optional().describe('Result range as [start, end] (e.g. [0, 100])'),
    sort: z.object({
      sortBy: z.string().describe('Column name to sort by'),
      sortOrder: z.enum(['asc', 'desc']).describe('Sort order'),
    }).optional().describe('Sort configuration'),
    filter: z.array(z.object({
      left: z.string().describe('Column name to filter on'),
      operation: z.string().describe('Filter operation'),
      right: z.union([z.string(), z.number(), z.array(z.number())]).describe('Filter value(s)'),
    })).optional().describe('Array of filter conditions'),
  },
  async ({ columns, range, sort, filter }) => {
    try {
      const body: Record<string, unknown> = {
        columns: columns || DEFAULT_COLUMNS,
      }
      if (range) body.range = range
      if (sort) body.sort = sort
      if (filter) body.filter = filter
      const result = await scannerPost('https://scanner.tradingview.com/crypto/scan', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_forex_screener -------------------------------------------------

server.tool(
  'tv_get_forex_screener',
  'Scan forex currency pairs on TradingView with configurable columns and optional filters.',
  {
    columns: z.array(z.string()).optional().describe('Columns to return (defaults to standard market data columns)'),
    range: z.array(z.number()).optional().describe('Result range as [start, end] (e.g. [0, 100])'),
    sort: z.object({
      sortBy: z.string().describe('Column name to sort by'),
      sortOrder: z.enum(['asc', 'desc']).describe('Sort order'),
    }).optional().describe('Sort configuration'),
    filter: z.array(z.object({
      left: z.string().describe('Column name to filter on'),
      operation: z.string().describe('Filter operation'),
      right: z.union([z.string(), z.number(), z.array(z.number())]).describe('Filter value(s)'),
    })).optional().describe('Array of filter conditions'),
  },
  async ({ columns, range, sort, filter }) => {
    try {
      const body: Record<string, unknown> = {
        columns: columns || DEFAULT_COLUMNS,
      }
      if (range) body.range = range
      if (sort) body.sort = sort
      if (filter) body.filter = filter
      const result = await scannerPost('https://scanner.tradingview.com/forex/scan', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_stock_screener -------------------------------------------------

server.tool(
  'tv_get_stock_screener',
  'Scan US stock markets on TradingView with configurable columns and optional filters.',
  {
    columns: z.array(z.string()).optional().describe('Columns to return (defaults to standard market data columns)'),
    range: z.array(z.number()).optional().describe('Result range as [start, end] (e.g. [0, 100])'),
    sort: z.object({
      sortBy: z.string().describe('Column name to sort by'),
      sortOrder: z.enum(['asc', 'desc']).describe('Sort order'),
    }).optional().describe('Sort configuration'),
    filter: z.array(z.object({
      left: z.string().describe('Column name to filter on'),
      operation: z.string().describe('Filter operation'),
      right: z.union([z.string(), z.number(), z.array(z.number())]).describe('Filter value(s)'),
    })).optional().describe('Array of filter conditions'),
  },
  async ({ columns, range, sort, filter }) => {
    try {
      const body: Record<string, unknown> = {
        columns: columns || DEFAULT_COLUMNS,
      }
      if (range) body.range = range
      if (sort) body.sort = sort
      if (filter) body.filter = filter
      const result = await scannerPost('https://scanner.tradingview.com/america/scan', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- tv_get_indicators -----------------------------------------------------

server.tool(
  'tv_get_indicators',
  'Get key technical indicators for symbols including Recommend.All (overall recommendation), RSI, MACD, Stochastic, ADX, and moving averages.',
  {
    symbols: z.array(z.string()).describe('List of symbols (e.g. ["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"])'),
    screener: z.enum(['crypto', 'forex', 'america', 'europe', 'asia']).optional().describe('Market screener to use (default "crypto")'),
    columns: z.array(z.string()).optional().describe('Specific TA columns to fetch. Defaults to all standard TA indicators.'),
  },
  async ({ symbols, screener, columns }) => {
    try {
      const scannerUrl = `https://scanner.tradingview.com/${screener || 'crypto'}/scan`
      const body = {
        symbols: { tickers: symbols },
        columns: columns || TA_COLUMNS,
      }
      const result = await scannerPost(scannerUrl, body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
