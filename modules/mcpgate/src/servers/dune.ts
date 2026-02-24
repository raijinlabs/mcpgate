/**
 * Dune Analytics MCP Server -- Production-ready
 *
 * Provides tools to interact with the Dune Analytics API for executing and
 * querying on-chain data analysis. Dune uses an async execution pattern:
 * execute_query returns an execution_id, then poll get_query_status or
 * get_query_results until completion.
 *
 * Tools:
 *   dune_execute_query      -- Execute a saved Dune query (async)
 *   dune_get_query_results  -- Get results of a completed execution
 *   dune_get_query_status   -- Check status of a query execution
 *   dune_get_latest_results -- Get cached latest results of a query
 *   dune_list_queries       -- Search for Dune queries
 *   dune_cancel_query       -- Cancel a running query execution
 *   dune_get_execution      -- Get execution details
 *   dune_get_table          -- Get column metadata for a Dune table
 *   dune_upload_csv         -- Upload a CSV file as a Dune table
 *   dune_create_query       -- Create a new Dune query
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'dune',
  baseUrl: 'https://api.dune.com/api/v1',
  tokenEnvVar: 'DUNE_API_KEY',
  authStyle: 'api-key-header',
  authHeader: 'x-dune-api-key',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dune-mcp',
  version: '0.1.0',
})

// ---- dune_execute_query ----------------------------------------------------

server.tool(
  'dune_execute_query',
  'Execute a saved Dune query by its query ID. Returns an execution_id that can be used to poll for results. This is an async operation -- use dune_get_query_status or dune_get_query_results to check completion.',
  {
    query_id: z.number().int().describe('Dune query ID to execute'),
    parameters: z
      .record(z.string())
      .optional()
      .describe('Key-value pairs for query parameters (e.g. {"address": "0x..."})'),
    performance: z
      .enum(['medium', 'large'])
      .optional()
      .describe('Execution tier: "medium" (default) or "large" for faster execution'),
  },
  async ({ query_id, parameters, performance }) => {
    try {
      const body: Record<string, unknown> = {}
      if (parameters) {
        body.query_parameters = parameters
      }
      if (performance) {
        body.performance = performance
      }
      const result = await call(`/query/${query_id}/execute`, {
        method: 'POST',
        body: Object.keys(body).length > 0 ? body : undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_get_query_results ------------------------------------------------

server.tool(
  'dune_get_query_results',
  'Get the results of a completed Dune query execution. Returns the data rows and metadata. Will return partial results if the query is still running.',
  {
    execution_id: z.string().describe('Execution ID returned from dune_execute_query'),
    limit: z
      .number()
      .int()
      .optional()
      .describe('Maximum number of result rows to return'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of rows to skip (for pagination)'),
  },
  async ({ execution_id, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      const result = await call(`/execution/${encodeURIComponent(execution_id)}/results`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_get_query_status -------------------------------------------------

server.tool(
  'dune_get_query_status',
  'Check the status of a Dune query execution. Returns state (QUERY_STATE_PENDING, QUERY_STATE_EXECUTING, QUERY_STATE_COMPLETED, QUERY_STATE_FAILED, etc.) and timing info.',
  {
    execution_id: z.string().describe('Execution ID returned from dune_execute_query'),
  },
  async ({ execution_id }) => {
    try {
      const result = await call(`/execution/${encodeURIComponent(execution_id)}/status`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_get_latest_results -----------------------------------------------

server.tool(
  'dune_get_latest_results',
  'Get the latest cached results of a Dune query without triggering a new execution. Returns the most recent successful execution results.',
  {
    query_id: z.number().int().describe('Dune query ID to get latest results for'),
    limit: z
      .number()
      .int()
      .optional()
      .describe('Maximum number of result rows to return'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of rows to skip (for pagination)'),
  },
  async ({ query_id, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      const result = await call(`/query/${query_id}/results`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_list_queries -----------------------------------------------------

server.tool(
  'dune_list_queries',
  'Search for Dune queries by keyword. Returns query metadata including name, description, and parameters.',
  {
    q: z.string().describe('Search query string to find Dune queries'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of queries to return (1-100, default 10)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of results to skip (for pagination)'),
  },
  async ({ q, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = { q }
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      const result = await call('/query/search', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_cancel_query -----------------------------------------------------

server.tool(
  'dune_cancel_query',
  'Cancel a running Dune query execution. Returns confirmation if the cancellation was successful.',
  {
    execution_id: z.string().describe('Execution ID of the running query to cancel'),
  },
  async ({ execution_id }) => {
    try {
      const result = await call(`/execution/${encodeURIComponent(execution_id)}/cancel`, {
        method: 'POST',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_get_execution ----------------------------------------------------

server.tool(
  'dune_get_execution',
  'Get full details of a Dune query execution including state, timing, and result metadata.',
  {
    execution_id: z.string().describe('Execution ID to retrieve details for'),
  },
  async ({ execution_id }) => {
    try {
      const result = await call(`/execution/${encodeURIComponent(execution_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_get_table --------------------------------------------------------

server.tool(
  'dune_get_table',
  'Get column metadata for a Dune table. Returns column names, types, and descriptions. Useful for understanding table schema before writing queries.',
  {
    namespace: z.string().describe('Table namespace (e.g. "ethereum", "dune", a user handle)'),
    table_name: z.string().describe('Table name within the namespace (e.g. "transactions", "blocks")'),
  },
  async ({ namespace, table_name }) => {
    try {
      const result = await call(
        `/table/${encodeURIComponent(namespace)}/${encodeURIComponent(table_name)}/column_metadata`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_upload_csv -------------------------------------------------------

server.tool(
  'dune_upload_csv',
  'Upload CSV data to create or replace a Dune table. The table will be available for querying after upload completes.',
  {
    table_name: z.string().describe('Name for the table (e.g. "my_addresses")'),
    data: z.string().describe('CSV content as a string (including header row)'),
    description: z
      .string()
      .optional()
      .describe('Description of the table contents'),
    is_private: z
      .boolean()
      .optional()
      .describe('Whether the table should be private (default false)'),
  },
  async ({ table_name, data, description, is_private }) => {
    try {
      const body: Record<string, unknown> = {
        table_name,
        data,
      }
      if (description !== undefined) body.description = description
      if (is_private !== undefined) body.is_private = is_private
      const result = await call('/table/upload/csv', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dune_create_query -----------------------------------------------------

server.tool(
  'dune_create_query',
  'Create a new Dune SQL query. Returns the created query object with its ID that can be used with dune_execute_query.',
  {
    name: z.string().describe('Name for the new query'),
    query_sql: z.string().describe('SQL query body using Dune SQL syntax'),
    description: z
      .string()
      .optional()
      .describe('Description of what the query does'),
    parameters: z
      .array(
        z.object({
          key: z.string().describe('Parameter name'),
          type: z
            .enum(['text', 'number', 'date', 'enum'])
            .describe('Parameter type'),
          value: z.string().describe('Default parameter value'),
        }),
      )
      .optional()
      .describe('Query parameters with default values'),
    is_private: z
      .boolean()
      .optional()
      .describe('Whether the query should be private (default false)'),
  },
  async ({ name, query_sql, description, parameters, is_private }) => {
    try {
      const body: Record<string, unknown> = {
        name,
        query_sql,
      }
      if (description !== undefined) body.description = description
      if (parameters !== undefined) body.parameters = parameters
      if (is_private !== undefined) body.is_private = is_private
      const result = await call('/query', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
