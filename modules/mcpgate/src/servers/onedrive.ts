/**
 * OneDrive MCP Server -- Production-ready
 *
 * Provides tools to interact with Microsoft OneDrive via the Microsoft Graph
 * API on behalf of the authenticated user.  Credentials are injected via the
 * MICROSOFT_TOKEN environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   onedrive_list_items    -- List items in the root folder
 *   onedrive_get_item      -- Get an item by ID
 *   onedrive_search        -- Search for files and folders
 *   onedrive_create_folder -- Create a new folder
 *   onedrive_delete_item   -- Delete a file or folder
 *   onedrive_move_item     -- Move or rename an item
 *   onedrive_copy_item     -- Copy an item to a new location
 *   onedrive_get_content   -- Get download URL for a file
 *   onedrive_list_children -- List children of a specific folder
 *   onedrive_share_item    -- Create a sharing link for an item
 *   onedrive_get_drive     -- Get the user's drive metadata
 *   onedrive_list_recent   -- List recently accessed files
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'onedrive',
  baseUrl: 'https://graph.microsoft.com/v1.0/me/drive',
  tokenEnvVar: 'MICROSOFT_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'onedrive-mcp',
  version: '0.1.0',
})

// ---- onedrive_list_items --------------------------------------------------

server.tool(
  'onedrive_list_items',
  'List files and folders in the root of the user\'s OneDrive. Returns item names, sizes, types, and last modified dates.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of items to return (1-1000). Uses OData $top.'),
    orderby: z
      .string()
      .optional()
      .describe('OData $orderby clause (e.g. "name asc", "lastModifiedDateTime desc")'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated fields to include (e.g. "id,name,size,lastModifiedDateTime,folder,file")'),
    skip_token: z
      .string()
      .optional()
      .describe('Pagination token from the @odata.nextLink of a previous response'),
  },
  async ({ top, orderby, select, skip_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        $top: top !== undefined ? String(top) : undefined,
        $orderby: orderby,
        $select: select,
        $skipToken: skip_token,
      }
      const result = await call('/root/children', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_get_item ----------------------------------------------------

server.tool(
  'onedrive_get_item',
  'Get metadata for a specific file or folder by its item ID. Returns name, size, creation date, and parent info.',
  {
    item_id: z.string().describe('The unique ID of the OneDrive item to retrieve'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated fields to include (e.g. "id,name,size,webUrl,lastModifiedDateTime")'),
  },
  async ({ item_id, select }) => {
    try {
      const query: Record<string, string | undefined> = {
        $select: select,
      }
      const result = await call(`/items/${item_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_search ------------------------------------------------------

server.tool(
  'onedrive_search',
  'Search for files and folders across the user\'s OneDrive. Returns matching items with relevance ranking.',
  {
    query: z
      .string()
      .describe('Search query string to match against file names and content'),
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (1-1000)'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated fields to include (e.g. "id,name,size,webUrl")'),
  },
  async ({ query, top, select }) => {
    try {
      const qp: Record<string, string | undefined> = {
        $top: top !== undefined ? String(top) : undefined,
        $select: select,
      }
      const encodedQuery = encodeURIComponent(query)
      const result = await call(`/root/search(q='${encodedQuery}')`, { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_create_folder -----------------------------------------------

server.tool(
  'onedrive_create_folder',
  'Create a new folder in the root of OneDrive or inside another folder. Returns the created folder metadata.',
  {
    name: z.string().describe('Name of the new folder to create'),
    parent_item_id: z
      .string()
      .optional()
      .describe('ID of the parent folder. Omit to create in the root folder.'),
    conflict_behavior: z
      .enum(['fail', 'replace', 'rename'])
      .optional()
      .describe('Behaviour if a folder with the same name exists: fail, replace, or rename (default: fail)'),
  },
  async ({ name, parent_item_id, conflict_behavior }) => {
    try {
      const body: Record<string, unknown> = {
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': conflict_behavior || 'fail',
      }

      const path = parent_item_id
        ? `/items/${parent_item_id}/children`
        : '/root/children'

      const result = await call(path, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_delete_item -------------------------------------------------

server.tool(
  'onedrive_delete_item',
  'Delete a file or folder from OneDrive. The item is moved to the recycle bin and can be restored.',
  {
    item_id: z.string().describe('The unique ID of the item to delete'),
  },
  async ({ item_id }) => {
    try {
      await call(`/items/${item_id}`, { method: 'DELETE' })
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_move_item ---------------------------------------------------

server.tool(
  'onedrive_move_item',
  'Move or rename a file or folder in OneDrive. Provide a new parent reference to move, a new name to rename, or both.',
  {
    item_id: z.string().describe('The unique ID of the item to move or rename'),
    new_name: z
      .string()
      .optional()
      .describe('New name for the item (e.g. "renamed-file.pdf")'),
    destination_folder_id: z
      .string()
      .optional()
      .describe('ID of the destination folder to move the item into'),
  },
  async ({ item_id, new_name, destination_folder_id }) => {
    try {
      const body: Record<string, unknown> = {}
      if (new_name !== undefined) body.name = new_name
      if (destination_folder_id !== undefined) {
        body.parentReference = { id: destination_folder_id }
      }

      const result = await call(`/items/${item_id}`, { method: 'PATCH', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_copy_item ---------------------------------------------------

server.tool(
  'onedrive_copy_item',
  'Copy a file or folder to a new location in OneDrive. The copy operation is asynchronous; returns a monitor URL to track progress.',
  {
    item_id: z.string().describe('The unique ID of the item to copy'),
    destination_folder_id: z
      .string()
      .describe('ID of the destination folder for the copy'),
    new_name: z
      .string()
      .optional()
      .describe('New name for the copied item. Omit to keep the original name.'),
  },
  async ({ item_id, destination_folder_id, new_name }) => {
    try {
      const body: Record<string, unknown> = {
        parentReference: { id: destination_folder_id },
      }
      if (new_name !== undefined) body.name = new_name

      const result = await call(`/items/${item_id}/copy`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_get_content -------------------------------------------------

server.tool(
  'onedrive_get_content',
  'Get the download URL for a file\'s content. The returned @microsoft.graph.downloadUrl can be used to download the file directly.',
  {
    item_id: z.string().describe('The unique ID of the file to get content for'),
  },
  async ({ item_id }) => {
    try {
      const result = await call(`/items/${item_id}/content`, {
        query: { redirect: 'false' },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_list_children -----------------------------------------------

server.tool(
  'onedrive_list_children',
  'List the children (files and subfolders) of a specific folder by its item ID.',
  {
    item_id: z.string().describe('The unique ID of the folder whose children to list'),
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of children to return (1-1000)'),
    orderby: z
      .string()
      .optional()
      .describe('OData $orderby clause (e.g. "name asc", "size desc")'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated fields to include (e.g. "id,name,size,folder,file")'),
    skip_token: z
      .string()
      .optional()
      .describe('Pagination token from the @odata.nextLink of a previous response'),
  },
  async ({ item_id, top, orderby, select, skip_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        $top: top !== undefined ? String(top) : undefined,
        $orderby: orderby,
        $select: select,
        $skipToken: skip_token,
      }
      const result = await call(`/items/${item_id}/children`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_share_item --------------------------------------------------

server.tool(
  'onedrive_share_item',
  'Create a sharing link for a file or folder. Returns the link URL with the specified permissions.',
  {
    item_id: z.string().describe('The unique ID of the item to share'),
    type: z
      .enum(['view', 'edit', 'embed'])
      .describe('Type of sharing link: view (read-only), edit (read-write), or embed (embeddable)'),
    scope: z
      .enum(['anonymous', 'organization'])
      .optional()
      .describe('Scope of the link: anonymous (anyone) or organization (same tenant). Default: anonymous.'),
    password: z
      .string()
      .optional()
      .describe('Optional password to protect the sharing link'),
    expiration_datetime: z
      .string()
      .optional()
      .describe('Expiration datetime for the link in ISO 8601 format (e.g. "2025-12-31T23:59:59Z")'),
  },
  async ({ item_id, type, scope, password, expiration_datetime }) => {
    try {
      const body: Record<string, unknown> = { type }
      if (scope !== undefined) body.scope = scope
      if (password !== undefined) body.password = password
      if (expiration_datetime !== undefined) body.expirationDateTime = expiration_datetime

      const result = await call(`/items/${item_id}/createLink`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_get_drive ---------------------------------------------------

server.tool(
  'onedrive_get_drive',
  'Get the authenticated user\'s OneDrive metadata including drive type, quota used, quota remaining, and owner info.',
  {},
  async () => {
    try {
      const result = await call('/')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- onedrive_list_recent -------------------------------------------------

server.tool(
  'onedrive_list_recent',
  'List recently accessed files in the user\'s OneDrive. Returns files the user has recently viewed or edited.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of recent items to return (1-200)'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated fields to include (e.g. "id,name,size,webUrl,lastModifiedDateTime")'),
  },
  async ({ top, select }) => {
    try {
      const query: Record<string, string | undefined> = {
        $top: top !== undefined ? String(top) : undefined,
        $select: select,
      }
      const result = await call('/recent', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
