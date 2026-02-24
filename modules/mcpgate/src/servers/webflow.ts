/**
 * Webflow MCP Server -- Production-ready
 *
 * Provides tools to interact with the Webflow REST API v2 on behalf of the
 * authenticated user.  Credentials are injected via the WEBFLOW_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   webflow_list_sites       -- List sites
 *   webflow_get_site         -- Get a single site
 *   webflow_list_collections -- List collections for a site
 *   webflow_get_collection   -- Get a single collection
 *   webflow_list_items       -- List items in a collection
 *   webflow_create_item      -- Create an item in a collection
 *   webflow_update_item      -- Update an item in a collection
 *   webflow_delete_item      -- Delete an item from a collection
 *   webflow_publish_site     -- Publish a site
 *   webflow_list_domains     -- List domains for a site
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'webflow',
  baseUrl: 'https://api.webflow.com/v2',
  tokenEnvVar: 'WEBFLOW_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'webflow-mcp',
  version: '0.1.0',
})

// ---- webflow_list_sites ---------------------------------------------------

server.tool(
  'webflow_list_sites',
  'List all Webflow sites accessible with the current token. Returns site IDs, names, and URLs.',
  {},
  async () => {
    try {
      const result = await call('/sites')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_get_site -----------------------------------------------------

server.tool(
  'webflow_get_site',
  'Get details of a single Webflow site by ID. Returns site configuration, publishing info, and locales.',
  {
    site_id: z.string().describe('The Webflow site ID'),
  },
  async ({ site_id }) => {
    try {
      const result = await call(`/sites/${site_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_list_collections ---------------------------------------------

server.tool(
  'webflow_list_collections',
  'List CMS collections for a Webflow site. Returns collection IDs, names, and slugs.',
  {
    site_id: z.string().describe('The Webflow site ID'),
  },
  async ({ site_id }) => {
    try {
      const result = await call(`/sites/${site_id}/collections`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_get_collection -----------------------------------------------

server.tool(
  'webflow_get_collection',
  'Get details of a single Webflow CMS collection. Returns collection schema with field definitions.',
  {
    collection_id: z.string().describe('The Webflow collection ID'),
  },
  async ({ collection_id }) => {
    try {
      const result = await call(`/collections/${collection_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_list_items ---------------------------------------------------

server.tool(
  'webflow_list_items',
  'List items in a Webflow CMS collection. Results are paginated.',
  {
    collection_id: z.string().describe('The Webflow collection ID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of items to return per page (1-100, default 100)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    sort_by: z
      .string()
      .optional()
      .describe('Field slug to sort by (prefix with "-" for descending, e.g. "-created-on")'),
    sort_order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order (only used if sort_by is provided)'),
  },
  async ({ collection_id, limit, offset, sort_by, sort_order }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)
      if (sort_by !== undefined) query.sortBy = sort_by
      if (sort_order !== undefined) query.sortOrder = sort_order

      const result = await call(`/collections/${collection_id}/items`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_create_item --------------------------------------------------

server.tool(
  'webflow_create_item',
  'Create a new item in a Webflow CMS collection. Field values must match the collection schema. Returns the created item.',
  {
    collection_id: z.string().describe('The Webflow collection ID'),
    field_data: z
      .record(z.unknown())
      .describe('Object with field slug-value pairs matching the collection schema (e.g. { "name": "My Item", "slug": "my-item" })'),
    is_draft: z
      .boolean()
      .optional()
      .describe('If true, create the item as a draft (not published). Default false.'),
    is_archived: z
      .boolean()
      .optional()
      .describe('If true, create the item in archived state. Default false.'),
  },
  async ({ collection_id, field_data, is_draft, is_archived }) => {
    try {
      const body: Record<string, unknown> = { fieldData: field_data }
      if (is_draft !== undefined) body.isDraft = is_draft
      if (is_archived !== undefined) body.isArchived = is_archived

      const result = await call(`/collections/${collection_id}/items`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_update_item --------------------------------------------------

server.tool(
  'webflow_update_item',
  'Update an existing item in a Webflow CMS collection. Only provided fields are modified. Returns the updated item.',
  {
    collection_id: z.string().describe('The Webflow collection ID'),
    item_id: z.string().describe('The item ID to update'),
    field_data: z
      .record(z.unknown())
      .describe('Object with field slug-value pairs to update'),
    is_draft: z
      .boolean()
      .optional()
      .describe('Set draft status'),
    is_archived: z
      .boolean()
      .optional()
      .describe('Set archived status'),
  },
  async ({ collection_id, item_id, field_data, is_draft, is_archived }) => {
    try {
      const body: Record<string, unknown> = { fieldData: field_data }
      if (is_draft !== undefined) body.isDraft = is_draft
      if (is_archived !== undefined) body.isArchived = is_archived

      const result = await call(`/collections/${collection_id}/items/${item_id}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_delete_item --------------------------------------------------

server.tool(
  'webflow_delete_item',
  'Delete an item from a Webflow CMS collection. Returns empty on success.',
  {
    collection_id: z.string().describe('The Webflow collection ID'),
    item_id: z.string().describe('The item ID to delete'),
  },
  async ({ collection_id, item_id }) => {
    try {
      const result = await call(`/collections/${collection_id}/items/${item_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_publish_site -------------------------------------------------

server.tool(
  'webflow_publish_site',
  'Publish a Webflow site to the specified domains. Deploys all staged changes.',
  {
    site_id: z.string().describe('The Webflow site ID to publish'),
    custom_domains: z
      .array(z.string())
      .optional()
      .describe('Array of custom domain names to publish to. If empty, publishes to all domains.'),
    publish_to_webflow_subdomain: z
      .boolean()
      .optional()
      .describe('Whether to publish to the Webflow subdomain (.webflow.io). Default true.'),
  },
  async ({ site_id, custom_domains, publish_to_webflow_subdomain }) => {
    try {
      const body: Record<string, unknown> = {}
      if (custom_domains !== undefined) body.customDomains = custom_domains
      if (publish_to_webflow_subdomain !== undefined) body.publishToWebflowSubdomain = publish_to_webflow_subdomain

      const result = await call(`/sites/${site_id}/publish`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- webflow_list_domains -------------------------------------------------

server.tool(
  'webflow_list_domains',
  'List custom domains configured for a Webflow site. Returns domain names, statuses, and DNS records.',
  {
    site_id: z.string().describe('The Webflow site ID'),
  },
  async ({ site_id }) => {
    try {
      const result = await call(`/sites/${site_id}/custom_domains`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
