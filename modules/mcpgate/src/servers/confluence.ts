/**
 * Confluence MCP Server -- Production-ready
 *
 * Provides tools to interact with the Confluence REST API v2 on behalf of
 * the authenticated user.  Credentials are injected via the CONFLUENCE_TOKEN
 * and CONFLUENCE_INSTANCE_URL environment variables (set by the MCPGate gateway).
 *
 * Tools:
 *   confluence_list_pages      -- List pages
 *   confluence_get_page        -- Get a single page
 *   confluence_create_page     -- Create a new page
 *   confluence_update_page     -- Update an existing page
 *   confluence_delete_page     -- Delete a page
 *   confluence_search          -- Search content with CQL
 *   confluence_list_spaces     -- List spaces
 *   confluence_get_space       -- Get a single space
 *   confluence_get_page_children -- Get child pages
 *   confluence_list_labels     -- List labels on a page
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const instanceUrl = process.env.CONFLUENCE_INSTANCE_URL || ''
  if (!instanceUrl) {
    throw new Error(
      'CONFLUENCE_INSTANCE_URL not configured. Set it to your Confluence instance URL (e.g. https://mycompany.atlassian.net).',
    )
  }
  return instanceUrl.replace(/\/+$/, '') + '/wiki/api/v2'
}

function makeClient() {
  return createApiClient({
    name: 'confluence',
    baseUrl: getBaseUrl(),
    tokenEnvVar: 'CONFLUENCE_TOKEN',
    authStyle: 'bearer',
    defaultHeaders: { Accept: 'application/json' },
  })
}

async function confluenceApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
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
  name: 'confluence-mcp',
  version: '0.1.0',
})

// ---- confluence_list_pages ------------------------------------------------

server.tool(
  'confluence_list_pages',
  'List pages in Confluence. Results are paginated and can be filtered by space or status.',
  {
    space_id: z
      .string()
      .optional()
      .describe('Filter pages by space ID'),
    status: z
      .enum(['current', 'trashed', 'draft', 'archived'])
      .optional()
      .describe('Filter pages by status (default: current)'),
    title: z
      .string()
      .optional()
      .describe('Filter pages by exact title match'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of pages to return (1-250, default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ space_id, status, title, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (space_id !== undefined) query['space-id'] = space_id
      if (status !== undefined) query.status = status
      if (title !== undefined) query.title = title
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor

      const result = await confluenceApi('/pages', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_get_page --------------------------------------------------

server.tool(
  'confluence_get_page',
  'Get a single Confluence page by ID. Returns page content, metadata, and version information.',
  {
    page_id: z.string().describe('The Confluence page ID'),
    body_format: z
      .enum(['storage', 'atlas_doc_format', 'view'])
      .optional()
      .describe('Format for the page body (default: storage)'),
    include_version: z
      .boolean()
      .optional()
      .describe('Whether to include version information (default false)'),
  },
  async ({ page_id, body_format, include_version }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (body_format !== undefined) query['body-format'] = body_format
      if (include_version !== undefined) query['include-version'] = String(include_version)

      const result = await confluenceApi(`/pages/${page_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_create_page -----------------------------------------------

server.tool(
  'confluence_create_page',
  'Create a new Confluence page. Returns the created page object with its ID.',
  {
    space_id: z.string().describe('The space ID to create the page in'),
    title: z.string().describe('Page title'),
    body: z.string().describe('Page body content in Confluence storage format (XHTML)'),
    parent_id: z
      .string()
      .optional()
      .describe('Parent page ID to create this page under'),
    status: z
      .enum(['current', 'draft'])
      .optional()
      .describe('Page status (default: current)'),
  },
  async ({ space_id, title, body, parent_id, status }) => {
    try {
      const reqBody: Record<string, unknown> = {
        spaceId: space_id,
        title,
        body: {
          representation: 'storage',
          value: body,
        },
      }
      if (parent_id !== undefined) reqBody.parentId = parent_id
      if (status !== undefined) reqBody.status = status

      const result = await confluenceApi('/pages', {
        method: 'POST',
        body: reqBody,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_update_page -----------------------------------------------

server.tool(
  'confluence_update_page',
  'Update an existing Confluence page. Requires the current version number for optimistic locking.',
  {
    page_id: z.string().describe('The page ID to update'),
    title: z.string().describe('New page title'),
    body: z.string().describe('New page body content in Confluence storage format (XHTML)'),
    version_number: z
      .number()
      .int()
      .describe('Current version number of the page (for optimistic locking). Increment by 1 from the current version.'),
    version_message: z
      .string()
      .optional()
      .describe('Optional version comment/message'),
    status: z
      .enum(['current', 'draft'])
      .optional()
      .describe('Page status'),
  },
  async ({ page_id, title, body, version_number, version_message, status }) => {
    try {
      const reqBody: Record<string, unknown> = {
        id: page_id,
        title,
        body: {
          representation: 'storage',
          value: body,
        },
        version: {
          number: version_number,
          ...(version_message !== undefined ? { message: version_message } : {}),
        },
      }
      if (status !== undefined) reqBody.status = status

      const result = await confluenceApi(`/pages/${page_id}`, {
        method: 'PUT',
        body: reqBody,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_delete_page -----------------------------------------------

server.tool(
  'confluence_delete_page',
  'Delete a Confluence page by ID. Returns empty on success.',
  {
    page_id: z.string().describe('The page ID to delete'),
  },
  async ({ page_id }) => {
    try {
      const result = await confluenceApi(`/pages/${page_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_search ----------------------------------------------------

server.tool(
  'confluence_search',
  'Search Confluence content using CQL (Confluence Query Language). Returns matching pages, blog posts, and other content.',
  {
    cql: z
      .string()
      .describe('CQL query string (e.g. "type=page AND space=DEV AND title~\\"meeting\\"")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of results to return (1-250, default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ cql, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = { cql }
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor

      const result = await confluenceApi('/search', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_list_spaces -----------------------------------------------

server.tool(
  'confluence_list_spaces',
  'List spaces in Confluence. Returns space details including key, name, and type.',
  {
    type: z
      .enum(['global', 'personal'])
      .optional()
      .describe('Filter by space type'),
    status: z
      .enum(['current', 'archived'])
      .optional()
      .describe('Filter by space status'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of spaces to return (1-250, default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ type, status, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (type !== undefined) query.type = type
      if (status !== undefined) query.status = status
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor

      const result = await confluenceApi('/spaces', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_get_space -------------------------------------------------

server.tool(
  'confluence_get_space',
  'Get details of a single Confluence space by ID.',
  {
    space_id: z.string().describe('The Confluence space ID'),
  },
  async ({ space_id }) => {
    try {
      const result = await confluenceApi(`/spaces/${space_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_get_page_children -----------------------------------------

server.tool(
  'confluence_get_page_children',
  'Get child pages of a Confluence page. Returns a list of direct child pages.',
  {
    page_id: z.string().describe('The parent page ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of child pages to return (1-250, default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ page_id, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor

      const result = await confluenceApi(`/pages/${page_id}/children`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- confluence_list_labels -----------------------------------------------

server.tool(
  'confluence_list_labels',
  'List labels attached to a Confluence page. Returns label names and IDs.',
  {
    page_id: z.string().describe('The page ID to list labels for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of labels to return (1-250, default 25)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ page_id, limit, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (cursor !== undefined) query.cursor = cursor

      const result = await confluenceApi(`/pages/${page_id}/labels`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

export default server
