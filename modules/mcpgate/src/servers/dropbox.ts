/**
 * Dropbox MCP Server -- Production-ready
 *
 * Provides tools to interact with the Dropbox API v2 on behalf of the
 * authenticated user.  Credentials are injected via the DROPBOX_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Note: Dropbox API v2 uses POST for virtually all endpoints, including
 * reads.  The request body is always JSON.
 *
 * Tools:
 *   dropbox_list_folder      -- List contents of a folder
 *   dropbox_get_metadata     -- Get metadata for a file or folder
 *   dropbox_search           -- Search for files and folders
 *   dropbox_create_folder    -- Create a new folder
 *   dropbox_delete           -- Delete a file or folder
 *   dropbox_move             -- Move a file or folder
 *   dropbox_copy             -- Copy a file or folder
 *   dropbox_get_link         -- Create a shared link for a file or folder
 *   dropbox_list_shared_links -- List shared links
 *   dropbox_get_account      -- Get the current user's account info
 *   dropbox_get_space_usage  -- Get the current user's space usage
 *   dropbox_list_revisions   -- List file revisions
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'dropbox',
  baseUrl: 'https://api.dropboxapi.com/2',
  tokenEnvVar: 'DROPBOX_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dropbox-mcp',
  version: '0.1.0',
})

// ---- dropbox_list_folder --------------------------------------------------

server.tool(
  'dropbox_list_folder',
  'List the contents of a Dropbox folder. Returns file and folder entries with metadata. Use an empty string for path to list the root folder.',
  {
    path: z
      .string()
      .describe('Path to the folder (e.g. "/Documents", "/Photos/2024"). Use empty string "" for the root folder.'),
    recursive: z
      .boolean()
      .optional()
      .describe('If true, list contents recursively including subfolders (default false)'),
    include_deleted: z
      .boolean()
      .optional()
      .describe('If true, include deleted entries in the results (default false)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe('Maximum number of entries to return (1-2000, default 500)'),
  },
  async ({ path, recursive, include_deleted, limit }) => {
    try {
      const body: Record<string, unknown> = { path }
      if (recursive !== undefined) body.recursive = recursive
      if (include_deleted !== undefined) body.include_deleted = include_deleted
      if (limit !== undefined) body.limit = limit

      const result = await call('/files/list_folder', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_get_metadata -------------------------------------------------

server.tool(
  'dropbox_get_metadata',
  'Get metadata for a file or folder at the given path. Returns size, modified date, content hash, and sharing info.',
  {
    path: z
      .string()
      .describe('Path to the file or folder (e.g. "/Documents/report.pdf")'),
    include_media_info: z
      .boolean()
      .optional()
      .describe('If true, include media info (dimensions, duration) for photos and videos (default false)'),
    include_has_explicit_shared_members: z
      .boolean()
      .optional()
      .describe('If true, include whether the file has explicit shared members (default false)'),
  },
  async ({ path, include_media_info, include_has_explicit_shared_members }) => {
    try {
      const body: Record<string, unknown> = { path }
      if (include_media_info !== undefined) body.include_media_info = include_media_info
      if (include_has_explicit_shared_members !== undefined) {
        body.include_has_explicit_shared_members = include_has_explicit_shared_members
      }

      const result = await call('/files/get_metadata', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_search -------------------------------------------------------

server.tool(
  'dropbox_search',
  'Search for files and folders in Dropbox by name or content. Returns matching entries with highlight snippets.',
  {
    query: z
      .string()
      .describe('The search query string (searches file names and contents)'),
    path: z
      .string()
      .optional()
      .describe('Restrict search to a specific folder path (e.g. "/Documents")'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (1-1000, default 100)'),
    file_categories: z
      .array(z.enum(['image', 'document', 'pdf', 'spreadsheet', 'presentation', 'audio', 'video', 'folder', 'paper', 'others']))
      .optional()
      .describe('Filter by file categories (e.g. ["image", "document"])'),
  },
  async ({ query, path, max_results, file_categories }) => {
    try {
      const body: Record<string, unknown> = { query }
      const options: Record<string, unknown> = {}
      if (path !== undefined) options.path = path
      if (max_results !== undefined) options.max_results = max_results
      if (file_categories !== undefined) {
        options.file_categories = file_categories.map((c) => ({ '.tag': c }))
      }
      if (Object.keys(options).length > 0) body.options = options

      const result = await call('/files/search_v2', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_create_folder ------------------------------------------------

server.tool(
  'dropbox_create_folder',
  'Create a new folder at the specified path. Returns the metadata of the newly created folder.',
  {
    path: z
      .string()
      .describe('Full path for the new folder (e.g. "/Documents/New Folder")'),
    autorename: z
      .boolean()
      .optional()
      .describe('If true, Dropbox will auto-rename the folder if a conflict exists (default false)'),
  },
  async ({ path, autorename }) => {
    try {
      const body: Record<string, unknown> = { path }
      if (autorename !== undefined) body.autorename = autorename

      const result = await call('/files/create_folder_v2', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_delete -------------------------------------------------------

server.tool(
  'dropbox_delete',
  'Delete a file or folder at the given path. The item is moved to the trash (can be restored within 30 days for Business accounts).',
  {
    path: z
      .string()
      .describe('Path of the file or folder to delete (e.g. "/Documents/old-report.pdf")'),
  },
  async ({ path }) => {
    try {
      const result = await call('/files/delete_v2', { method: 'POST', body: { path } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_move ---------------------------------------------------------

server.tool(
  'dropbox_move',
  'Move a file or folder from one path to another. Can also be used to rename items.',
  {
    from_path: z
      .string()
      .describe('Current path of the file or folder (e.g. "/Documents/report.pdf")'),
    to_path: z
      .string()
      .describe('Destination path for the file or folder (e.g. "/Archive/report.pdf")'),
    autorename: z
      .boolean()
      .optional()
      .describe('If true, Dropbox will auto-rename the item if a conflict exists at the destination (default false)'),
    allow_ownership_transfer: z
      .boolean()
      .optional()
      .describe('If true, allow moves that result in ownership transfer for Business accounts (default false)'),
  },
  async ({ from_path, to_path, autorename, allow_ownership_transfer }) => {
    try {
      const body: Record<string, unknown> = { from_path, to_path }
      if (autorename !== undefined) body.autorename = autorename
      if (allow_ownership_transfer !== undefined) body.allow_ownership_transfer = allow_ownership_transfer

      const result = await call('/files/move_v2', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_copy ---------------------------------------------------------

server.tool(
  'dropbox_copy',
  'Copy a file or folder from one path to another. Returns metadata of the copied item.',
  {
    from_path: z
      .string()
      .describe('Source path of the file or folder to copy (e.g. "/Documents/template.docx")'),
    to_path: z
      .string()
      .describe('Destination path for the copy (e.g. "/Documents/template-copy.docx")'),
    autorename: z
      .boolean()
      .optional()
      .describe('If true, Dropbox will auto-rename if a conflict exists at the destination (default false)'),
  },
  async ({ from_path, to_path, autorename }) => {
    try {
      const body: Record<string, unknown> = { from_path, to_path }
      if (autorename !== undefined) body.autorename = autorename

      const result = await call('/files/copy_v2', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_get_link -----------------------------------------------------

server.tool(
  'dropbox_get_link',
  'Create a shared link for a file or folder. If a shared link already exists, it will be returned. Returns the URL and access settings.',
  {
    path: z
      .string()
      .describe('Path to the file or folder to share (e.g. "/Documents/report.pdf")'),
    requested_visibility: z
      .enum(['public', 'team_only', 'password'])
      .optional()
      .describe('Requested visibility for the shared link: public, team_only, or password'),
    audience: z
      .enum(['public', 'team', 'no_one'])
      .optional()
      .describe('Audience for the shared link: public, team, or no_one'),
  },
  async ({ path, requested_visibility, audience }) => {
    try {
      const body: Record<string, unknown> = { path }
      const settings: Record<string, unknown> = {}
      if (requested_visibility !== undefined) settings.requested_visibility = requested_visibility
      if (audience !== undefined) settings.audience = audience
      if (Object.keys(settings).length > 0) body.settings = settings

      const result = await call('/sharing/create_shared_link_with_settings', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_list_shared_links --------------------------------------------

server.tool(
  'dropbox_list_shared_links',
  'List shared links for a file, folder, or the entire Dropbox. Returns URLs and their access settings.',
  {
    path: z
      .string()
      .optional()
      .describe('Path to list shared links for. Omit to list all shared links in the account.'),
    direct_only: z
      .boolean()
      .optional()
      .describe('If true, only return direct links to the item (not links to parent folders)'),
    cursor: z
      .string()
      .optional()
      .describe('Cursor from a previous response for pagination'),
  },
  async ({ path, direct_only, cursor }) => {
    try {
      const body: Record<string, unknown> = {}
      if (path !== undefined) body.path = path
      if (direct_only !== undefined) body.direct_only = direct_only
      if (cursor !== undefined) body.cursor = cursor

      const result = await call('/sharing/list_shared_links', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_get_account --------------------------------------------------

server.tool(
  'dropbox_get_account',
  'Get the current user\'s Dropbox account information including name, email, country, and account type.',
  {},
  async () => {
    try {
      const result = await call('/users/get_current_account', { method: 'POST', body: null })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_get_space_usage ----------------------------------------------

server.tool(
  'dropbox_get_space_usage',
  'Get the current user\'s Dropbox space usage. Returns used space, allocated space, and team allocation if applicable.',
  {},
  async () => {
    try {
      const result = await call('/users/get_space_usage', { method: 'POST', body: null })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- dropbox_list_revisions -----------------------------------------------

server.tool(
  'dropbox_list_revisions',
  'List revision history for a file. Returns past versions with timestamps and sizes that can be used to restore previous versions.',
  {
    path: z
      .string()
      .describe('Path to the file to list revisions for (e.g. "/Documents/report.pdf")'),
    mode: z
      .enum(['path', 'id'])
      .optional()
      .describe('How to identify the file: "path" (by path) or "id" (by file ID). Default: path.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of revisions to return (1-100, default 10)'),
  },
  async ({ path, mode, limit }) => {
    try {
      const body: Record<string, unknown> = { path }
      if (mode !== undefined) body.mode = { '.tag': mode }
      if (limit !== undefined) body.limit = limit

      const result = await call('/files/list_revisions', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
