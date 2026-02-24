/**
 * Google Drive MCP Server -- Production-ready
 *
 * Provides tools to interact with the Google Drive API v3 on behalf of the
 * authenticated user.  Credentials are injected via the GOOGLE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   gdrive_list_files        -- List files in the user's Drive
 *   gdrive_get_file          -- Get file metadata by ID
 *   gdrive_create_file       -- Create a file (metadata only)
 *   gdrive_update_file       -- Update file metadata
 *   gdrive_delete_file       -- Permanently delete a file
 *   gdrive_search_files      -- Search files using a query string
 *   gdrive_create_folder     -- Create a folder
 *   gdrive_move_file         -- Move a file to a different folder
 *   gdrive_copy_file         -- Copy a file
 *   gdrive_share_file        -- Share a file by creating a permission
 *   gdrive_list_permissions  -- List permissions on a file
 *   gdrive_download_file     -- Download file content
 *   gdrive_get_about         -- Get information about the user's Drive
 *   gdrive_list_changes      -- List changes to the user's Drive
 *   gdrive_empty_trash       -- Permanently delete all trashed files
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'google-drive',
  baseUrl: 'https://www.googleapis.com/drive/v3',
  tokenEnvVar: 'GOOGLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'google-drive-mcp',
  version: '0.1.0',
})

// ---- gdrive_list_files ----------------------------------------------------

server.tool(
  'gdrive_list_files',
  'List files in the authenticated user\'s Google Drive. Returns file names, IDs, MIME types, and metadata. Results are paginated.',
  {
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of files to return (1-1000, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Token for retrieving the next page of results'),
    order_by: z
      .string()
      .optional()
      .describe('Sort order, e.g. "modifiedTime desc", "name", "folder,modifiedTime desc"'),
    fields: z
      .string()
      .optional()
      .describe('Fields to include in the response, e.g. "files(id,name,mimeType,modifiedTime)"'),
  },
  async ({ page_size, page_token, order_by, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.pageSize = String(page_size)
      if (page_token) query.pageToken = page_token
      if (order_by) query.orderBy = order_by
      if (fields) query.fields = fields

      const result = await call('/files', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_get_file ------------------------------------------------------

server.tool(
  'gdrive_get_file',
  'Get metadata for a single Google Drive file by its ID. Returns file name, MIME type, size, parents, and other metadata.',
  {
    file_id: z.string().describe('The ID of the file to retrieve'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include, e.g. "id,name,mimeType,size,parents"'),
  },
  async ({ file_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields) query.fields = fields

      const result = await call(`/files/${encodeURIComponent(file_id)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_create_file ---------------------------------------------------

server.tool(
  'gdrive_create_file',
  'Create a new file in Google Drive (metadata only). For uploading content, use the multipart upload endpoint separately. Returns the created file metadata.',
  {
    name: z.string().describe('Name of the file to create'),
    mime_type: z
      .string()
      .optional()
      .describe('MIME type of the file (e.g. "application/pdf", "text/plain")'),
    parents: z
      .array(z.string())
      .optional()
      .describe('Array of parent folder IDs. If not specified, the file is placed in the root.'),
    description: z
      .string()
      .optional()
      .describe('Description of the file'),
  },
  async ({ name, mime_type, parents, description }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (mime_type !== undefined) body.mimeType = mime_type
      if (parents !== undefined) body.parents = parents
      if (description !== undefined) body.description = description

      const result = await call('/files', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_update_file ---------------------------------------------------

server.tool(
  'gdrive_update_file',
  'Update metadata for an existing Google Drive file. Only provided fields are changed. Returns the updated file metadata.',
  {
    file_id: z.string().describe('The ID of the file to update'),
    name: z.string().optional().describe('New name for the file'),
    description: z.string().optional().describe('New description for the file'),
    mime_type: z.string().optional().describe('New MIME type for the file'),
    starred: z.boolean().optional().describe('Whether the file should be starred'),
    trashed: z.boolean().optional().describe('Whether the file should be trashed'),
  },
  async ({ file_id, name, description, mime_type, starred, trashed }) => {
    try {
      const body: Record<string, unknown> = {}
      if (name !== undefined) body.name = name
      if (description !== undefined) body.description = description
      if (mime_type !== undefined) body.mimeType = mime_type
      if (starred !== undefined) body.starred = starred
      if (trashed !== undefined) body.trashed = trashed

      const result = await call(`/files/${encodeURIComponent(file_id)}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_delete_file ---------------------------------------------------

server.tool(
  'gdrive_delete_file',
  'Permanently delete a file from Google Drive. This action cannot be undone. Returns confirmation on success.',
  {
    file_id: z.string().describe('The ID of the file to permanently delete'),
  },
  async ({ file_id }) => {
    try {
      await call(`/files/${encodeURIComponent(file_id)}`, { method: 'DELETE' })
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_search_files --------------------------------------------------

server.tool(
  'gdrive_search_files',
  'Search for files in Google Drive using a query string. Supports Drive query syntax (e.g. "name contains \'report\'" or "mimeType = \'application/pdf\'"). Returns matching files.',
  {
    q: z
      .string()
      .describe('Drive search query string (e.g. "name contains \'budget\' and mimeType = \'application/vnd.google-apps.spreadsheet\'")'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of results to return (1-1000, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Token for retrieving the next page of results'),
    fields: z
      .string()
      .optional()
      .describe('Fields to include in the response'),
  },
  async ({ q, page_size, page_token, fields }) => {
    try {
      const query: Record<string, string | undefined> = { q }
      if (page_size !== undefined) query.pageSize = String(page_size)
      if (page_token) query.pageToken = page_token
      if (fields) query.fields = fields

      const result = await call('/files', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_create_folder -------------------------------------------------

server.tool(
  'gdrive_create_folder',
  'Create a new folder in Google Drive. Returns the created folder metadata including its ID.',
  {
    name: z.string().describe('Name of the folder to create'),
    parents: z
      .array(z.string())
      .optional()
      .describe('Array of parent folder IDs. If not specified, the folder is created in the root.'),
    description: z
      .string()
      .optional()
      .describe('Description of the folder'),
  },
  async ({ name, parents, description }) => {
    try {
      const body: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      }
      if (parents !== undefined) body.parents = parents
      if (description !== undefined) body.description = description

      const result = await call('/files', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_move_file -----------------------------------------------------

server.tool(
  'gdrive_move_file',
  'Move a file from one folder to another in Google Drive. Removes the file from its current parent and adds it to the new parent. Returns the updated file metadata.',
  {
    file_id: z.string().describe('The ID of the file to move'),
    new_parent_id: z.string().describe('The ID of the destination folder'),
    current_parent_id: z
      .string()
      .optional()
      .describe('The ID of the current parent folder to remove from. If omitted, all current parents are removed.'),
  },
  async ({ file_id, new_parent_id, current_parent_id }) => {
    try {
      const query: Record<string, string | undefined> = {
        addParents: new_parent_id,
      }
      if (current_parent_id) {
        query.removeParents = current_parent_id
      }

      const result = await call(`/files/${encodeURIComponent(file_id)}`, {
        method: 'PATCH',
        body: {},
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_copy_file -----------------------------------------------------

server.tool(
  'gdrive_copy_file',
  'Create a copy of a file in Google Drive. Optionally specify a new name and destination folder. Returns the copied file metadata.',
  {
    file_id: z.string().describe('The ID of the file to copy'),
    name: z.string().optional().describe('Name for the copied file. Defaults to "Copy of {original name}".'),
    parents: z
      .array(z.string())
      .optional()
      .describe('Array of parent folder IDs for the copy. Defaults to the same parent as the original.'),
  },
  async ({ file_id, name, parents }) => {
    try {
      const body: Record<string, unknown> = {}
      if (name !== undefined) body.name = name
      if (parents !== undefined) body.parents = parents

      const result = await call(`/files/${encodeURIComponent(file_id)}/copy`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_share_file ----------------------------------------------------

server.tool(
  'gdrive_share_file',
  'Share a file by creating a permission. Supports sharing with specific users, groups, domains, or anyone with the link. Returns the created permission.',
  {
    file_id: z.string().describe('The ID of the file to share'),
    role: z
      .enum(['reader', 'writer', 'commenter', 'owner', 'organizer', 'fileOrganizer'])
      .describe('The role to grant (reader, writer, commenter, owner, organizer, fileOrganizer)'),
    type: z
      .enum(['user', 'group', 'domain', 'anyone'])
      .describe('The type of grantee (user, group, domain, anyone)'),
    email_address: z
      .string()
      .optional()
      .describe('Email address of the user or group to share with. Required for type "user" or "group".'),
    domain: z
      .string()
      .optional()
      .describe('Domain to share with. Required for type "domain".'),
    send_notification_email: z
      .boolean()
      .optional()
      .describe('Whether to send a notification email to the grantee (default true)'),
  },
  async ({ file_id, role, type, email_address, domain, send_notification_email }) => {
    try {
      const body: Record<string, unknown> = { role, type }
      if (email_address !== undefined) body.emailAddress = email_address
      if (domain !== undefined) body.domain = domain

      const query: Record<string, string | undefined> = {}
      if (send_notification_email !== undefined) {
        query.sendNotificationEmail = String(send_notification_email)
      }

      const result = await call(`/files/${encodeURIComponent(file_id)}/permissions`, {
        method: 'POST',
        body,
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_list_permissions ----------------------------------------------

server.tool(
  'gdrive_list_permissions',
  'List permissions on a Google Drive file. Returns the list of users, groups, and domains that have access.',
  {
    file_id: z.string().describe('The ID of the file to list permissions for'),
    fields: z
      .string()
      .optional()
      .describe('Fields to include, e.g. "permissions(id,role,type,emailAddress)"'),
  },
  async ({ file_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields) query.fields = fields

      const result = await call(`/files/${encodeURIComponent(file_id)}/permissions`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_download_file -------------------------------------------------

server.tool(
  'gdrive_download_file',
  'Download the content of a Google Drive file. Returns the file content as text. For binary files, use the export endpoint for Google Workspace files or the alt=media parameter for other files.',
  {
    file_id: z.string().describe('The ID of the file to download'),
    mime_type: z
      .string()
      .optional()
      .describe('For Google Workspace files, the MIME type to export as (e.g. "application/pdf", "text/csv"). If omitted, downloads the raw file content.'),
  },
  async ({ file_id, mime_type }) => {
    try {
      let result: unknown
      if (mime_type) {
        // Export Google Workspace files
        result = await call(`/files/${encodeURIComponent(file_id)}/export`, {
          query: { mimeType: mime_type },
        })
      } else {
        // Download non-Workspace files
        result = await call(`/files/${encodeURIComponent(file_id)}`, {
          query: { alt: 'media' },
        })
      }
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_get_about -----------------------------------------------------

server.tool(
  'gdrive_get_about',
  'Get information about the authenticated user\'s Google Drive, including storage quota, user info, and supported export formats.',
  {
    fields: z
      .string()
      .optional()
      .describe('Fields to include in the response (default: "*" for all fields)'),
  },
  async ({ fields }) => {
    try {
      const result = await call('/about', {
        query: { fields: fields || '*' },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_list_changes --------------------------------------------------

server.tool(
  'gdrive_list_changes',
  'List changes to the user\'s Google Drive since a given change token. Use gdrive_get_about or the startPageToken endpoint to get the initial token.',
  {
    page_token: z
      .string()
      .describe('The token for the start of the changes list, obtained from the startPageToken endpoint or a previous list response'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of changes to return (1-1000, default 100)'),
    fields: z
      .string()
      .optional()
      .describe('Fields to include in the response'),
  },
  async ({ page_token, page_size, fields }) => {
    try {
      const query: Record<string, string | undefined> = {
        pageToken: page_token,
      }
      if (page_size !== undefined) query.pageSize = String(page_size)
      if (fields) query.fields = fields

      const result = await call('/changes', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdrive_empty_trash ---------------------------------------------------

server.tool(
  'gdrive_empty_trash',
  'Permanently delete all files in the user\'s Google Drive trash. This action cannot be undone. Returns confirmation on success.',
  {},
  async () => {
    try {
      await call('/files/trash', { method: 'DELETE' })
      return successContent({ emptied: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
