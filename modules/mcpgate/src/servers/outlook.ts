/**
 * Outlook MCP Server -- Production-ready
 *
 * Provides tools to interact with the Microsoft Graph API (Outlook Mail)
 * on behalf of the authenticated user.  Credentials are injected via the
 * MICROSOFT_TOKEN environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   outlook_send_email      -- Send an email
 *   outlook_list_messages   -- List messages in the inbox
 *   outlook_get_message     -- Get a single message by ID
 *   outlook_search_messages -- Search messages using $search
 *   outlook_create_draft    -- Create a draft message
 *   outlook_reply_message   -- Reply to a message
 *   outlook_forward_message -- Forward a message
 *   outlook_delete_message  -- Delete a message
 *   outlook_list_folders    -- List mail folders
 *   outlook_move_message    -- Move a message to another folder
 *   outlook_create_folder   -- Create a new mail folder
 *   outlook_list_contacts   -- List contacts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'outlook',
  baseUrl: 'https://graph.microsoft.com/v1.0/me',
  tokenEnvVar: 'MICROSOFT_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'outlook-mcp',
  version: '0.1.0',
})

// ---- outlook_send_email ---------------------------------------------------

server.tool(
  'outlook_send_email',
  'Send an email from the authenticated Outlook user. Supports HTML/text body, multiple recipients (to, cc, bcc), and attachments. Returns empty on success (HTTP 202).',
  {
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body content'),
    body_type: z
      .enum(['Text', 'HTML'])
      .optional()
      .describe('Body content type: "Text" or "HTML" (default "HTML")'),
    to: z
      .array(z.string())
      .describe('Array of recipient email addresses'),
    cc: z
      .array(z.string())
      .optional()
      .describe('Array of CC recipient email addresses'),
    bcc: z
      .array(z.string())
      .optional()
      .describe('Array of BCC recipient email addresses'),
    importance: z
      .enum(['Low', 'Normal', 'High'])
      .optional()
      .describe('Email importance level (default "Normal")'),
    save_to_sent: z
      .boolean()
      .optional()
      .describe('Whether to save the message in Sent Items (default true)'),
  },
  async ({ subject, body, body_type, to, cc, bcc, importance, save_to_sent }) => {
    try {
      const toRecipients = to.map((email) => ({
        emailAddress: { address: email },
      }))
      const message: Record<string, unknown> = {
        subject,
        body: { contentType: body_type || 'HTML', content: body },
        toRecipients,
      }

      if (cc) {
        message.ccRecipients = cc.map((email) => ({
          emailAddress: { address: email },
        }))
      }
      if (bcc) {
        message.bccRecipients = bcc.map((email) => ({
          emailAddress: { address: email },
        }))
      }
      if (importance) message.importance = importance

      const payload: Record<string, unknown> = { message }
      if (save_to_sent !== undefined) payload.saveToSentItems = save_to_sent

      const result = await call('/sendMail', { method: 'POST', body: payload })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_list_messages ------------------------------------------------

server.tool(
  'outlook_list_messages',
  'List email messages in the authenticated user\'s mailbox. Results are paginated. Supports OData query parameters for filtering and ordering.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of messages to return (1-1000, default 10)'),
    skip: z
      .number()
      .int()
      .optional()
      .describe('Number of messages to skip for pagination'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated list of properties to select (e.g. "subject,from,receivedDateTime,isRead")'),
    filter: z
      .string()
      .optional()
      .describe('OData $filter expression (e.g. "isRead eq false")'),
    orderby: z
      .string()
      .optional()
      .describe('OData $orderby expression (e.g. "receivedDateTime desc")'),
    folder_id: z
      .string()
      .optional()
      .describe('Mail folder ID to list messages from (default: Inbox)'),
  },
  async ({ top, skip, select, filter, orderby, folder_id }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)
      if (select !== undefined) query['$select'] = select
      if (filter !== undefined) query['$filter'] = filter
      if (orderby !== undefined) query['$orderby'] = orderby

      const path = folder_id
        ? `/mailFolders/${folder_id}/messages`
        : '/messages'

      const result = await call(path, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_get_message --------------------------------------------------

server.tool(
  'outlook_get_message',
  'Retrieve a single email message by its ID. Returns full message details including body, headers, and attachments metadata.',
  {
    message_id: z.string().describe('The ID of the message to retrieve'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated list of properties to select'),
  },
  async ({ message_id, select }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (select !== undefined) query['$select'] = select

      const result = await call(`/messages/${message_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_search_messages ----------------------------------------------

server.tool(
  'outlook_search_messages',
  'Search for email messages using a keyword search query. Uses the Microsoft Graph $search parameter to find messages across the mailbox.',
  {
    query: z
      .string()
      .describe('Search query string (e.g. "from:john budget report")'),
    top: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Maximum number of results to return (1-250, default 10)'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated list of properties to select'),
  },
  async ({ query, top, select }) => {
    try {
      const qp: Record<string, string | undefined> = {
        '$search': `"${query}"`,
      }
      if (top !== undefined) qp['$top'] = String(top)
      if (select !== undefined) qp['$select'] = select

      const result = await call('/messages', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_create_draft -------------------------------------------------

server.tool(
  'outlook_create_draft',
  'Create a draft email message. The draft is saved in the Drafts folder and can be sent later. Returns the created draft with its ID.',
  {
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body content'),
    body_type: z
      .enum(['Text', 'HTML'])
      .optional()
      .describe('Body content type: "Text" or "HTML" (default "HTML")'),
    to: z
      .array(z.string())
      .describe('Array of recipient email addresses'),
    cc: z
      .array(z.string())
      .optional()
      .describe('Array of CC recipient email addresses'),
    importance: z
      .enum(['Low', 'Normal', 'High'])
      .optional()
      .describe('Email importance level (default "Normal")'),
  },
  async ({ subject, body, body_type, to, cc, importance }) => {
    try {
      const message: Record<string, unknown> = {
        subject,
        body: { contentType: body_type || 'HTML', content: body },
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
      }

      if (cc) {
        message.ccRecipients = cc.map((email) => ({
          emailAddress: { address: email },
        }))
      }
      if (importance) message.importance = importance

      const result = await call('/messages', { method: 'POST', body: message })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_reply_message ------------------------------------------------

server.tool(
  'outlook_reply_message',
  'Reply to an email message. Sends a reply to the sender (or reply-all). Returns empty on success.',
  {
    message_id: z.string().describe('The ID of the message to reply to'),
    comment: z.string().describe('Reply body text (HTML supported)'),
  },
  async ({ message_id, comment }) => {
    try {
      const result = await call(`/messages/${message_id}/reply`, {
        method: 'POST',
        body: { comment },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_forward_message ----------------------------------------------

server.tool(
  'outlook_forward_message',
  'Forward an email message to one or more recipients. Returns empty on success.',
  {
    message_id: z.string().describe('The ID of the message to forward'),
    comment: z
      .string()
      .optional()
      .describe('Optional comment to include with the forwarded message'),
    to: z
      .array(z.string())
      .describe('Array of recipient email addresses to forward to'),
  },
  async ({ message_id, comment, to }) => {
    try {
      const toRecipients = to.map((email) => ({
        emailAddress: { address: email },
      }))
      const body: Record<string, unknown> = { toRecipients }
      if (comment !== undefined) body.comment = comment

      const result = await call(`/messages/${message_id}/forward`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_delete_message -----------------------------------------------

server.tool(
  'outlook_delete_message',
  'Delete an email message by its ID. The message is moved to Deleted Items. Returns empty on success.',
  {
    message_id: z.string().describe('The ID of the message to delete'),
  },
  async ({ message_id }) => {
    try {
      const result = await call(`/messages/${message_id}`, { method: 'DELETE' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_list_folders -------------------------------------------------

server.tool(
  'outlook_list_folders',
  'List mail folders in the authenticated user\'s mailbox. Returns folder IDs, names, and unread counts.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of folders to return (1-500, default 10)'),
    include_hidden: z
      .boolean()
      .optional()
      .describe('Whether to include hidden folders (default false)'),
  },
  async ({ top, include_hidden }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (include_hidden) query.includeHiddenFolders = 'true'

      const result = await call('/mailFolders', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_move_message -------------------------------------------------

server.tool(
  'outlook_move_message',
  'Move an email message to a different mail folder. Returns the moved message with its new ID.',
  {
    message_id: z.string().describe('The ID of the message to move'),
    destination_folder_id: z
      .string()
      .describe('The ID of the destination folder (e.g. "Inbox", "Archive", or a folder ID)'),
  },
  async ({ message_id, destination_folder_id }) => {
    try {
      const result = await call(`/messages/${message_id}/move`, {
        method: 'POST',
        body: { destinationId: destination_folder_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_create_folder ------------------------------------------------

server.tool(
  'outlook_create_folder',
  'Create a new mail folder in the user\'s mailbox. Can be a top-level folder or a child of an existing folder. Returns the created folder.',
  {
    display_name: z.string().describe('Display name for the new folder'),
    parent_folder_id: z
      .string()
      .optional()
      .describe('ID of the parent folder to create this folder under (omit for top-level)'),
    is_hidden: z
      .boolean()
      .optional()
      .describe('Whether the folder should be hidden (default false)'),
  },
  async ({ display_name, parent_folder_id, is_hidden }) => {
    try {
      const body: Record<string, unknown> = { displayName: display_name }
      if (is_hidden !== undefined) body.isHidden = is_hidden

      const path = parent_folder_id
        ? `/mailFolders/${parent_folder_id}/childFolders`
        : '/mailFolders'

      const result = await call(path, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- outlook_list_contacts ------------------------------------------------

server.tool(
  'outlook_list_contacts',
  'List the authenticated user\'s Outlook contacts. Returns contact details including names, email addresses, and phone numbers.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of contacts to return (1-1000, default 10)'),
    skip: z
      .number()
      .int()
      .optional()
      .describe('Number of contacts to skip for pagination'),
    select: z
      .string()
      .optional()
      .describe('Comma-separated list of properties to select (e.g. "displayName,emailAddresses")'),
    filter: z
      .string()
      .optional()
      .describe('OData $filter expression to filter contacts'),
  },
  async ({ top, skip, select, filter }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)
      if (select !== undefined) query['$select'] = select
      if (filter !== undefined) query['$filter'] = filter

      const result = await call('/contacts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
