/**
 * Supabase API MCP Server -- Production-ready
 *
 * Provides tools to interact with a Supabase project via the PostgREST API
 * on behalf of the authenticated user.  Credentials are injected via the
 * SUPABASE_PROJECT_URL and SUPABASE_SERVICE_KEY environment variables
 * (set by the MCPGate gateway).
 *
 * Named "supabase-api" to avoid conflict with the built-in Supabase MCP tool.
 *
 * Authentication uses Bearer token + apikey header.
 *
 * Tools:
 *   supabase_query          -- Query rows from a table
 *   supabase_insert         -- Insert rows into a table
 *   supabase_update         -- Update rows in a table
 *   supabase_delete         -- Delete rows from a table
 *   supabase_rpc            -- Call a database function
 *   supabase_list_tables    -- List tables in the database
 *   supabase_count          -- Count rows in a table
 *   supabase_upsert         -- Upsert rows into a table
 *   supabase_get_by_id      -- Get a single row by ID
 *   supabase_search         -- Full-text search on a column
 *   supabase_list_functions -- List database functions
 *   supabase_get_schema     -- Get table column information
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const url = process.env.SUPABASE_PROJECT_URL || ''
  if (!url) {
    throw new Error(
      'SUPABASE_PROJECT_URL not configured. Set it to your Supabase project URL (e.g. https://xxxx.supabase.co).',
    )
  }
  return url.replace(/\/+$/, '') + '/rest/v1'
}

function makeClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''
  return createApiClient({
    name: 'supabase',
    baseUrl: getBaseUrl(),
    tokenEnvVar: 'SUPABASE_SERVICE_KEY',
    authStyle: 'bearer',
    defaultHeaders: {
      apikey: serviceKey,
    },
  })
}

async function supabaseApi(
  path: string,
  opts: {
    method?: string
    body?: unknown
    query?: Record<string, string | undefined>
    headers?: Record<string, string>
  } = {},
): Promise<unknown> {
  const { call } = makeClient()
  return call(path, opts)
}

function getCategoriseError() {
  return makeClient().categoriseError
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'supabase-api-mcp',
  version: '0.1.0',
})

// ---- supabase_query -------------------------------------------------------

server.tool(
  'supabase_query',
  'Query rows from a Supabase table. Supports column selection, filtering, ordering, and pagination via PostgREST syntax.',
  {
    table: z.string().describe('Table name to query'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated columns to select (default "*"). Supports PostgREST syntax like "id,name,posts(title)"'),
    filter: z
      .string()
      .optional()
      .describe('PostgREST filter string appended to URL (e.g. "age=gte.18&status=eq.active")'),
    order: z
      .string()
      .optional()
      .describe('Order clause (e.g. "created_at.desc", "name.asc,id.desc")'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of rows to return'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of rows to skip (for pagination)'),
  },
  async ({ table, select, filter, order, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      query.select = select || '*'
      if (order !== undefined) query.order = order
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      let path = `/${encodeURIComponent(table)}`
      if (filter) {
        path += `?${filter}`
      }

      const result = await supabaseApi(path, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_insert ------------------------------------------------------

server.tool(
  'supabase_insert',
  'Insert one or more rows into a Supabase table. Returns the inserted rows.',
  {
    table: z.string().describe('Table name to insert into'),
    rows: z
      .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
      .describe('A single row object or array of row objects to insert'),
    return_representation: z
      .boolean()
      .optional()
      .describe('If true, return the inserted rows (default true)'),
  },
  async ({ table, rows, return_representation }) => {
    try {
      const headers: Record<string, string> = {}
      if (return_representation !== false) {
        headers.Prefer = 'return=representation'
      }

      const result = await supabaseApi(`/${encodeURIComponent(table)}`, {
        method: 'POST',
        body: rows,
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_update ------------------------------------------------------

server.tool(
  'supabase_update',
  'Update rows in a Supabase table matching the given filters. IMPORTANT: filters are required to prevent accidental full-table updates.',
  {
    table: z.string().describe('Table name to update'),
    filters: z
      .string()
      .describe('PostgREST filter string to match rows (e.g. "id=eq.123" or "status=eq.pending&age=gte.18")'),
    data: z.record(z.unknown()).describe('Object with column-value pairs to update'),
    return_representation: z
      .boolean()
      .optional()
      .describe('If true, return the updated rows (default true)'),
  },
  async ({ table, filters, data, return_representation }) => {
    try {
      const headers: Record<string, string> = {}
      if (return_representation !== false) {
        headers.Prefer = 'return=representation'
      }

      const result = await supabaseApi(`/${encodeURIComponent(table)}?${filters}`, {
        method: 'PATCH',
        body: data,
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_delete ------------------------------------------------------

server.tool(
  'supabase_delete',
  'Delete rows from a Supabase table matching the given filters. IMPORTANT: filters are required to prevent accidental full-table deletes.',
  {
    table: z.string().describe('Table name to delete from'),
    filters: z
      .string()
      .describe('PostgREST filter string to match rows (e.g. "id=eq.123")'),
    return_representation: z
      .boolean()
      .optional()
      .describe('If true, return the deleted rows (default false)'),
  },
  async ({ table, filters, return_representation }) => {
    try {
      const headers: Record<string, string> = {}
      if (return_representation) {
        headers.Prefer = 'return=representation'
      }

      const result = await supabaseApi(`/${encodeURIComponent(table)}?${filters}`, {
        method: 'DELETE',
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_rpc ---------------------------------------------------------

server.tool(
  'supabase_rpc',
  'Call a Supabase database function (RPC). Pass function arguments as a JSON object.',
  {
    function_name: z.string().describe('Name of the database function to call'),
    args: z
      .record(z.unknown())
      .optional()
      .describe('Arguments to pass to the function as key-value pairs'),
  },
  async ({ function_name, args }) => {
    try {
      const result = await supabaseApi(`/rpc/${encodeURIComponent(function_name)}`, {
        method: 'POST',
        body: args || {},
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_list_tables -------------------------------------------------

server.tool(
  'supabase_list_tables',
  'List all tables in the Supabase database. Uses the pg_catalog to retrieve table information from the public schema.',
  {
    schema: z
      .string()
      .optional()
      .describe('Database schema to list tables from (default: "public")'),
  },
  async ({ schema }) => {
    try {
      const schemaName = schema || 'public'
      const result = await supabaseApi('/rpc/pg_tables_list', {
        method: 'POST',
        body: { schema_name: schemaName },
      })
      return successContent(result)
    } catch (err) {
      // Fallback: try querying information_schema directly
      try {
        const schemaName = schema || 'public'
        const result = await supabaseApi(
          `/rpc/sql`,
          {
            method: 'POST',
            body: {
              query: `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${schemaName}' ORDER BY table_name`,
            },
          },
        )
        return successContent(result)
      } catch (fallbackErr) {
        return errorContent(err, getCategoriseError())
      }
    }
  },
)

// ---- supabase_count -------------------------------------------------------

server.tool(
  'supabase_count',
  'Count rows in a Supabase table, optionally with filters. Uses the Prefer: count=exact header.',
  {
    table: z.string().describe('Table name to count rows from'),
    filters: z
      .string()
      .optional()
      .describe('PostgREST filter string to match rows (e.g. "status=eq.active")'),
  },
  async ({ table, filters }) => {
    try {
      let path = `/${encodeURIComponent(table)}`
      if (filters) {
        path += `?${filters}`
      }

      const headers: Record<string, string> = {
        Prefer: 'count=exact',
        'Range-Unit': 'items',
        Range: '0-0',
      }

      const result = await supabaseApi(path, {
        query: { select: 'count' },
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_upsert ------------------------------------------------------

server.tool(
  'supabase_upsert',
  'Upsert (insert or update on conflict) rows into a Supabase table. Uses the Prefer: resolution=merge-duplicates header.',
  {
    table: z.string().describe('Table name to upsert into'),
    rows: z
      .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
      .describe('A single row object or array of row objects to upsert'),
    on_conflict: z
      .string()
      .optional()
      .describe('Comma-separated column names that define the conflict target (e.g. "id" or "email")'),
    return_representation: z
      .boolean()
      .optional()
      .describe('If true, return the upserted rows (default true)'),
  },
  async ({ table, rows, on_conflict, return_representation }) => {
    try {
      const headers: Record<string, string> = {
        Prefer: 'resolution=merge-duplicates',
      }
      if (return_representation !== false) {
        headers.Prefer += ',return=representation'
      }

      const query: Record<string, string | undefined> = {}
      if (on_conflict !== undefined) query.on_conflict = on_conflict

      const result = await supabaseApi(`/${encodeURIComponent(table)}`, {
        method: 'POST',
        body: rows,
        headers,
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_get_by_id ---------------------------------------------------

server.tool(
  'supabase_get_by_id',
  'Get a single row from a Supabase table by its primary key. Returns the row or an error if not found.',
  {
    table: z.string().describe('Table name to query'),
    id_column: z
      .string()
      .optional()
      .describe('Name of the primary key column (default: "id")'),
    id_value: z.string().describe('Value of the primary key to look up'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated columns to select (default "*")'),
  },
  async ({ table, id_column, id_value, select }) => {
    try {
      const col = id_column || 'id'
      const query: Record<string, string | undefined> = {
        select: select || '*',
      }

      const headers: Record<string, string> = {
        Accept: 'application/vnd.pgrst.object+json',
      }

      const result = await supabaseApi(
        `/${encodeURIComponent(table)}?${col}=eq.${encodeURIComponent(id_value)}`,
        { query, headers },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_search ------------------------------------------------------

server.tool(
  'supabase_search',
  'Perform full-text search on a Supabase table column. Uses PostgREST text search filters.',
  {
    table: z.string().describe('Table name to search'),
    column: z.string().describe('Column name to search in (must have a text search index)'),
    query: z.string().describe('Search query string (e.g. "hello & world" for AND, "hello | world" for OR)'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated columns to select (default "*")'),
    type: z
      .enum(['fts', 'plfts', 'phfts', 'wfts'])
      .optional()
      .describe('Text search type: fts=full-text, plfts=plain, phfts=phrase, wfts=websearch (default: fts)'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of rows to return'),
  },
  async ({ table, column, query, select, type, limit }) => {
    try {
      const searchType = type || 'fts'
      const filterStr = `${column}=${searchType}.${encodeURIComponent(query)}`
      const queryParams: Record<string, string | undefined> = {
        select: select || '*',
      }
      if (limit !== undefined) queryParams.limit = String(limit)

      const result = await supabaseApi(
        `/${encodeURIComponent(table)}?${filterStr}`,
        { query: queryParams },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- supabase_list_functions ----------------------------------------------

server.tool(
  'supabase_list_functions',
  'List database functions (RPCs) available in the Supabase project. Queries pg_catalog for function metadata.',
  {
    schema: z
      .string()
      .optional()
      .describe('Schema to list functions from (default: "public")'),
  },
  async ({ schema }) => {
    try {
      const schemaName = schema || 'public'
      const result = await supabaseApi('/rpc/pg_functions_list', {
        method: 'POST',
        body: { schema_name: schemaName },
      })
      return successContent(result)
    } catch (err) {
      try {
        const schemaName = schema || 'public'
        const result = await supabaseApi('/rpc/sql', {
          method: 'POST',
          body: {
            query: `SELECT routine_name, routine_type, data_type FROM information_schema.routines WHERE routine_schema = '${schemaName}' ORDER BY routine_name`,
          },
        })
        return successContent(result)
      } catch (fallbackErr) {
        return errorContent(err, getCategoriseError())
      }
    }
  },
)

// ---- supabase_get_schema --------------------------------------------------

server.tool(
  'supabase_get_schema',
  'Get column information for a Supabase table. Returns column names, types, nullability, and defaults.',
  {
    table: z.string().describe('Table name to get schema for'),
    schema: z
      .string()
      .optional()
      .describe('Database schema (default: "public")'),
  },
  async ({ table, schema }) => {
    try {
      const schemaName = schema || 'public'
      const result = await supabaseApi('/rpc/pg_table_schema', {
        method: 'POST',
        body: { table_name: table, schema_name: schemaName },
      })
      return successContent(result)
    } catch (err) {
      try {
        const schemaName = schema || 'public'
        const result = await supabaseApi('/rpc/sql', {
          method: 'POST',
          body: {
            query: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = '${table}' ORDER BY ordinal_position`,
          },
        })
        return successContent(result)
      } catch (fallbackErr) {
        return errorContent(err, getCategoriseError())
      }
    }
  },
)

export default server
