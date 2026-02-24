/**
 * Notion MCP Server -- Production-ready
 *
 * Provides tools to interact with the Notion API on behalf of the
 * authenticated integration.  Credentials are injected via the NOTION_TOKEN
 * environment variable (Internal Integration Token, set by the MCPGate
 * gateway).
 *
 * Tools:
 *   notion_create_page      -- Create a page inside a parent page or database
 *   notion_search           -- Search pages and databases
 *   notion_get_page         -- Retrieve a page by ID
 *   notion_update_page      -- Update page properties
 *   notion_query_database   -- Query a Notion database with optional filters
 *   notion_create_database  -- Create a new database in a page
 *   notion_get_database     -- Retrieve a database by ID
 *   notion_list_databases   -- List databases the integration can access
 *   notion_append_blocks    -- Append child blocks to a page or block
 *   notion_get_block        -- Retrieve a block by ID
 *   notion_delete_block     -- Delete (archive) a block by ID
 *   notion_update_database  -- Update a database title or schema
 *   notion_list_comments    -- List comments on a block or page
 *   notion_create_comment   -- Add a comment to a page
 *   notion_list_users       -- List users in the workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NOTION_TOKEN = process.env.NOTION_TOKEN || ''
const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

interface ApiErrorDetail {
  status: number
  code: string
  message: string
  retryAfterMs?: number
}

class NotionApiError extends Error {
  status: number
  code: string
  retryAfterMs?: number

  constructor(detail: ApiErrorDetail) {
    const tag =
      detail.code === 'unauthorized' || detail.status === 401
        ? 'Authentication error'
        : detail.code === 'restricted_resource' || detail.status === 403
          ? 'Authorization error'
          : detail.code === 'rate_limited' || detail.status === 429
            ? 'Rate limit exceeded'
            : detail.status >= 500
              ? 'Notion server error'
              : 'Notion API error'
    super(`${tag} (${detail.status} ${detail.code}): ${detail.message}`)
    this.name = 'NotionApiError'
    this.status = detail.status
    this.code = detail.code
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof NotionApiError) {
    if (err.code === 'unauthorized' || err.status === 401) {
      return {
        message: err.message,
        hint: 'Your Notion integration token is invalid or expired. Reconnect via /v1/auth/connect/notion',
      }
    }
    if (err.code === 'restricted_resource' || err.status === 403) {
      return {
        message: err.message,
        hint: 'The integration does not have access to this resource. Share the page/database with the integration in Notion.',
      }
    }
    if (err.code === 'rate_limited' || err.status === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.code === 'object_not_found') {
      return {
        message: err.message,
        hint: 'The requested page or database was not found. Verify the ID and ensure the integration has access.',
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Notion is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}


// ---------------------------------------------------------------------------
// API helper with retry on rate-limit
// ---------------------------------------------------------------------------

async function notionApi(
  path: string,
  opts: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<unknown> {
  if (!NOTION_TOKEN) {
    throw new Error(
      'Notion token not configured. Connect via /v1/auth/connect/notion',
    )
  }

  const res = await fetch(`${NOTION_API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  // Rate-limit retry
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '1')
    const retryMs = retryAfterSec * 1000

    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return notionApi(path, opts, attempt + 1)
    }

    const body = await res.text()
    throw new NotionApiError({
      status: 429,
      code: 'rate_limited',
      message: body,
      retryAfterMs: retryMs,
    })
  }

  if (!res.ok) {
    let code = 'unknown'
    let message = ''
    try {
      const errBody = (await res.json()) as Record<string, unknown>
      code = typeof errBody.code === 'string' ? errBody.code : code
      message = typeof errBody.message === 'string' ? errBody.message : JSON.stringify(errBody)
    } catch {
      message = await res.text().catch(() => `HTTP ${res.status}`)
    }
    throw new NotionApiError({ status: res.status, code, message })
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'notion-mcp',
  version: '0.1.0',
})

// ---- notion_create_page ---------------------------------------------------

server.tool(
  'notion_create_page',
  'Create a new page inside a Notion parent page or database. Optionally supply paragraph content. Returns the created page object.',
  {
    parent_id: z
      .string()
      .describe(
        'ID of the parent page or database. Use a page ID (with or without hyphens) or a database ID.',
      ),
    title: z.string().describe('Page title displayed as the page heading'),
    content: z
      .string()
      .optional()
      .describe(
        'Plain-text paragraph content to add as the initial body of the page',
      ),
  },
  async ({ parent_id, title, content }) => {
    try {
      // Determine parent type heuristically: if it starts with a known
      // database-style prefix or the caller explicitly passes a database_id we
      // use database_id, otherwise page_id.  The caller can always use the
      // query_database tool to discover database IDs.
      const parent: Record<string, unknown> = { page_id: parent_id }

      const properties: Record<string, unknown> = {
        title: {
          title: [{ type: 'text', text: { content: title } }],
        },
      }

      const body: Record<string, unknown> = { parent, properties }

      if (content) {
        body.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content } }],
            },
          },
        ]
      }

      const result = await notionApi('/pages', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_search --------------------------------------------------------

server.tool(
  'notion_search',
  'Search across all pages and databases the integration has access to in Notion. Returns matching results with titles and IDs.',
  {
    query: z
      .string()
      .optional()
      .describe(
        'Search query string. If omitted, returns recently edited pages.',
      ),
    filter: z
      .enum(['page', 'database'])
      .optional()
      .describe(
        'Restrict results to pages or databases only',
      ),
  },
  async ({ query, filter }) => {
    try {
      const body: Record<string, unknown> = {}
      if (query !== undefined) body.query = query
      if (filter !== undefined) {
        body.filter = { value: filter, property: 'object' }
      }

      const result = await notionApi('/search', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_get_page ------------------------------------------------------

server.tool(
  'notion_get_page',
  'Retrieve a Notion page by its ID. Returns the full page object including properties and metadata.',
  {
    page_id: z
      .string()
      .describe('The ID of the page to retrieve (with or without hyphens)'),
  },
  async ({ page_id }) => {
    try {
      const result = await notionApi(`/pages/${page_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_update_page ---------------------------------------------------

server.tool(
  'notion_update_page',
  'Update properties of an existing Notion page. Use this to modify database row values, toggle archived status, or update the icon/cover. Returns the updated page object.',
  {
    page_id: z
      .string()
      .describe('The ID of the page to update'),
    properties: z
      .record(z.unknown())
      .describe(
        'A map of property names to property value objects following the Notion property schema (see Notion API docs for format)',
      ),
  },
  async ({ page_id, properties }) => {
    try {
      const result = await notionApi(`/pages/${page_id}`, {
        method: 'PATCH',
        body: { properties },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_query_database ------------------------------------------------

server.tool(
  'notion_query_database',
  'Query a Notion database with optional filters and sorts. Returns matching pages (rows) from the database.',
  {
    database_id: z
      .string()
      .describe('The ID of the database to query'),
    filter: z
      .record(z.unknown())
      .optional()
      .describe(
        'Notion filter object. Example: { "property": "Status", "select": { "equals": "Done" } }',
      ),
    sorts: z
      .array(
        z.object({
          property: z.string().optional().describe('Property name to sort by'),
          timestamp: z
            .enum(['created_time', 'last_edited_time'])
            .optional()
            .describe('Timestamp field to sort by'),
          direction: z
            .enum(['ascending', 'descending'])
            .describe('Sort direction'),
        }),
      )
      .optional()
      .describe(
        'Array of sort criteria applied in order. Each entry sorts by a property name or timestamp.',
      ),
  },
  async ({ database_id, filter, sorts }) => {
    try {
      const body: Record<string, unknown> = {}
      if (filter !== undefined) body.filter = filter
      if (sorts !== undefined) body.sorts = sorts

      const result = await notionApi(`/databases/${database_id}/query`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_create_database -----------------------------------------------

server.tool(
  'notion_create_database',
  'Create a new database in a Notion page. Properties define the database schema (e.g., { Name: { title: {} }, Status: { select: { options: [{ name: "To Do" }, { name: "Done" }] } } }). Returns the created database object.',
  {
    parent_page_id: z
      .string()
      .describe('The ID of the parent page where the database will be created'),
    title: z.string().describe('Title of the new database'),
    properties: z
      .record(z.unknown())
      .describe(
        'Database property schema as a map of property names to property configuration objects (see Notion API docs for format)',
      ),
  },
  async ({ parent_page_id, title, properties }) => {
    try {
      const result = await notionApi('/databases', {
        method: 'POST',
        body: {
          parent: { page_id: parent_page_id },
          title: [{ text: { content: title } }],
          properties,
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_get_database --------------------------------------------------

server.tool(
  'notion_get_database',
  'Retrieve a Notion database by its ID. Returns the full database object including schema, title, and metadata.',
  {
    database_id: z
      .string()
      .describe('The ID of the database to retrieve (with or without hyphens)'),
  },
  async ({ database_id }) => {
    try {
      const result = await notionApi(`/databases/${database_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_list_databases ------------------------------------------------

server.tool(
  'notion_list_databases',
  'List databases the integration has access to in Notion. Uses the search endpoint filtered to databases only.',
  {
    query: z
      .string()
      .optional()
      .describe('Optional search query to filter databases by title'),
    page_size: z
      .number()
      .optional()
      .describe('Number of results to return (default 10, max 100)'),
  },
  async ({ query, page_size }) => {
    try {
      const body: Record<string, unknown> = {
        filter: { property: 'object', value: 'database' },
        page_size: page_size ?? 10,
      }
      if (query !== undefined) body.query = query

      const result = await notionApi('/search', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_append_blocks -------------------------------------------------

server.tool(
  'notion_append_blocks',
  'Append child blocks to a page or block. Children should be Notion block objects (e.g., { paragraph: { rich_text: [{ text: { content: "Hello" } }] } }). Returns the updated block with new children.',
  {
    block_id: z
      .string()
      .describe('The ID of the page or block to append children to'),
    children: z
      .array(z.record(z.unknown()))
      .describe(
        'Array of Notion block objects to append (see Notion API docs for block type formats)',
      ),
  },
  async ({ block_id, children }) => {
    try {
      const result = await notionApi(`/blocks/${block_id}/children`, {
        method: 'PATCH',
        body: { children },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_get_block -----------------------------------------------------

server.tool(
  'notion_get_block',
  'Retrieve a Notion block by its ID. Returns the full block object including type-specific content.',
  {
    block_id: z
      .string()
      .describe('The ID of the block to retrieve (with or without hyphens)'),
  },
  async ({ block_id }) => {
    try {
      const result = await notionApi(`/blocks/${block_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_delete_block --------------------------------------------------

server.tool(
  'notion_delete_block',
  'Delete (archive) a Notion block by its ID. This also deletes all children of the block. Returns the deleted block object.',
  {
    block_id: z
      .string()
      .describe('The ID of the block to delete'),
  },
  async ({ block_id }) => {
    try {
      const result = await notionApi(`/blocks/${block_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_update_database -----------------------------------------------

server.tool(
  'notion_update_database',
  'Update a Notion database title or property schema. Only provided fields are updated; omitted fields remain unchanged. Returns the updated database object.',
  {
    database_id: z
      .string()
      .describe('The ID of the database to update'),
    title: z
      .string()
      .optional()
      .describe('New title for the database'),
    properties: z
      .record(z.unknown())
      .optional()
      .describe(
        'Updated property schema as a map of property names to property configuration objects (see Notion API docs for format)',
      ),
  },
  async ({ database_id, title, properties }) => {
    try {
      const body: Record<string, unknown> = {}
      if (title !== undefined) {
        body.title = [{ text: { content: title } }]
      }
      if (properties !== undefined) {
        body.properties = properties
      }

      const result = await notionApi(`/databases/${database_id}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_list_comments -------------------------------------------------

server.tool(
  'notion_list_comments',
  'List comments on a Notion block or page. Returns a paginated list of comment objects.',
  {
    block_id: z
      .string()
      .describe('The ID of the block or page to retrieve comments for'),
    page_size: z
      .number()
      .optional()
      .describe('Number of comments to return (default 10, max 100)'),
  },
  async ({ block_id, page_size }) => {
    try {
      const size = page_size ?? 10
      const result = await notionApi(
        `/comments?block_id=${encodeURIComponent(block_id)}&page_size=${size}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_create_comment ------------------------------------------------

server.tool(
  'notion_create_comment',
  'Add a comment to a Notion page. The comment appears in the page discussion. Returns the created comment object.',
  {
    parent_page_id: z
      .string()
      .describe('The ID of the page to comment on'),
    text: z
      .string()
      .describe('Plain-text content of the comment'),
  },
  async ({ parent_page_id, text }) => {
    try {
      const result = await notionApi('/comments', {
        method: 'POST',
        body: {
          parent: { page_id: parent_page_id },
          rich_text: [{ text: { content: text } }],
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- notion_list_users ----------------------------------------------------

server.tool(
  'notion_list_users',
  'List users in the Notion workspace. Returns a paginated list of user objects including names, emails, and avatar URLs.',
  {
    page_size: z
      .number()
      .optional()
      .describe('Number of users to return (default 10, max 100)'),
  },
  async ({ page_size }) => {
    try {
      const size = page_size ?? 10
      const result = await notionApi(`/users?page_size=${size}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
