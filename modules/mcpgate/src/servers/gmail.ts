/**
 * Gmail MCP Server -- Production-ready
 *
 * Provides tools to interact with the Gmail API (v1) on behalf of the
 * authenticated user.  Credentials are injected via the GMAIL_TOKEN
 * environment variable (OAuth2 access token, set by the MCPGate gateway).
 *
 * Tools:
 *   gmail_send_email      -- Send an email (base64url-encoded RFC 2822)
 *   gmail_list_messages    -- List messages in the mailbox
 *   gmail_get_message      -- Get a single message by ID
 *   gmail_search_messages  -- Search messages with Gmail query syntax
 *   gmail_list_labels      -- List all labels
 *   gmail_create_label     -- Create a new label
 *   gmail_add_label        -- Add labels to a message
 *   gmail_remove_label     -- Remove labels from a message
 *   gmail_trash_message    -- Move a message to trash
 *   gmail_star_message     -- Star a message
 *   gmail_create_draft     -- Create a draft email
 *   gmail_send_draft       -- Send an existing draft
 *   gmail_list_drafts      -- List drafts
 *   gmail_get_thread       -- Get a thread by ID
 *   gmail_list_threads     -- List threads
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'gmail',
  baseUrl: 'https://gmail.googleapis.com/gmail/v1',
  tokenEnvVar: 'GMAIL_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal RFC 2822 message string and return it base64url-encoded,
 * ready for the Gmail API `raw` field.
 */
function buildRawEmail(opts: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  in_reply_to?: string
  references?: string
  content_type?: string
}): string {
  const lines: string[] = []
  lines.push(`To: ${opts.to}`)
  if (opts.cc) lines.push(`Cc: ${opts.cc}`)
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`)
  lines.push(`Subject: ${opts.subject}`)
  if (opts.in_reply_to) lines.push(`In-Reply-To: ${opts.in_reply_to}`)
  if (opts.references) lines.push(`References: ${opts.references}`)
  lines.push(`Content-Type: ${opts.content_type || 'text/plain'}; charset=utf-8`)
  lines.push('')
  lines.push(opts.body)

  const raw = lines.join('\r\n')
  // Base64url encode (Node Buffer)
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'gmail-mcp',
  version: '0.1.0',
})

// ---- gmail_send_email -----------------------------------------------------

server.tool(
  'gmail_send_email',
  'Send an email from the authenticated Gmail account. The message is constructed from the provided fields and base64url-encoded as RFC 2822. Returns the sent message metadata.',
  {
    to: z
      .string()
      .describe('Recipient email address (or comma-separated for multiple recipients)'),
    subject: z
      .string()
      .describe('Email subject line'),
    body: z
      .string()
      .describe('Email body text'),
    cc: z
      .string()
      .optional()
      .describe('CC recipients (comma-separated email addresses)'),
    bcc: z
      .string()
      .optional()
      .describe('BCC recipients (comma-separated email addresses)'),
    content_type: z
      .enum(['text/plain', 'text/html'])
      .optional()
      .describe('Content type of the email body (default: text/plain)'),
    in_reply_to: z
      .string()
      .optional()
      .describe('Message-ID of the email being replied to (for threading)'),
    thread_id: z
      .string()
      .optional()
      .describe('Gmail thread ID to add this message to (for threading)'),
  },
  async ({ to, subject, body, cc, bcc, content_type, in_reply_to, thread_id }) => {
    try {
      const raw = buildRawEmail({ to, subject, body, cc, bcc, in_reply_to, content_type })
      const payload: Record<string, unknown> = { raw }
      if (thread_id) payload.threadId = thread_id

      const result = await call('/users/me/messages/send', {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_list_messages --------------------------------------------------

server.tool(
  'gmail_list_messages',
  'List messages in the authenticated user\'s mailbox. Returns message IDs and thread IDs. Use gmail_get_message to retrieve full content.',
  {
    max_results: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of messages to return (1-500, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous list response for pagination'),
    label_ids: z
      .array(z.string())
      .optional()
      .describe('Only return messages with all of these label IDs (e.g. ["INBOX", "UNREAD"])'),
    include_spam_trash: z
      .boolean()
      .optional()
      .describe('Whether to include messages from SPAM and TRASH (default false)'),
  },
  async ({ max_results, page_token, label_ids, include_spam_trash }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (max_results !== undefined) query.maxResults = String(max_results)
      if (page_token) query.pageToken = page_token
      if (label_ids) query.labelIds = label_ids.join(',')
      if (include_spam_trash !== undefined) query.includeSpamTrash = String(include_spam_trash)

      const result = await call('/users/me/messages', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_get_message ----------------------------------------------------

server.tool(
  'gmail_get_message',
  'Get a single Gmail message by its ID. Returns full message content including headers, body, and attachments metadata.',
  {
    message_id: z
      .string()
      .describe('The ID of the message to retrieve'),
    format: z
      .enum(['full', 'metadata', 'minimal', 'raw'])
      .optional()
      .describe('Response format: full (default), metadata (headers only), minimal (IDs only), raw (RFC 2822)'),
  },
  async ({ message_id, format }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (format) query.format = format

      const result = await call(`/users/me/messages/${message_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_search_messages ------------------------------------------------

server.tool(
  'gmail_search_messages',
  'Search for messages using Gmail query syntax (same as the Gmail search bar). Returns matching message IDs. Examples: "from:user@example.com", "subject:meeting", "is:unread after:2024/01/01".',
  {
    query: z
      .string()
      .describe('Gmail search query string (e.g. "from:user@example.com is:unread", "subject:invoice after:2024/01/01")'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of results to return (1-500, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous search response for pagination'),
  },
  async ({ query, max_results, page_token }) => {
    try {
      const qp: Record<string, string | undefined> = { q: query }
      if (max_results !== undefined) qp.maxResults = String(max_results)
      if (page_token) qp.pageToken = page_token

      const result = await call('/users/me/messages', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_list_labels ----------------------------------------------------

server.tool(
  'gmail_list_labels',
  'List all labels in the authenticated user\'s Gmail account. Returns label IDs, names, and types (system vs user).',
  {},
  async () => {
    try {
      const result = await call('/users/me/labels')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_create_label ---------------------------------------------------

server.tool(
  'gmail_create_label',
  'Create a new user label in Gmail. Returns the created label object with its ID.',
  {
    name: z
      .string()
      .describe('Display name for the new label'),
    label_list_visibility: z
      .enum(['labelShow', 'labelShowIfUnread', 'labelHide'])
      .optional()
      .describe('Visibility of the label in the label list (default: labelShow)'),
    message_list_visibility: z
      .enum(['show', 'hide'])
      .optional()
      .describe('Visibility of messages with this label in the message list (default: show)'),
  },
  async ({ name, label_list_visibility, message_list_visibility }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (label_list_visibility) body.labelListVisibility = label_list_visibility
      if (message_list_visibility) body.messageListVisibility = message_list_visibility

      const result = await call('/users/me/labels', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_add_label ------------------------------------------------------

server.tool(
  'gmail_add_label',
  'Add one or more labels to a Gmail message. Use this to categorize or organize messages.',
  {
    message_id: z
      .string()
      .describe('The ID of the message to add labels to'),
    label_ids: z
      .array(z.string())
      .describe('Array of label IDs to add to the message (e.g. ["STARRED", "Label_123"])'),
  },
  async ({ message_id, label_ids }) => {
    try {
      const result = await call(`/users/me/messages/${message_id}/modify`, {
        method: 'POST',
        body: { addLabelIds: label_ids },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_remove_label ---------------------------------------------------

server.tool(
  'gmail_remove_label',
  'Remove one or more labels from a Gmail message.',
  {
    message_id: z
      .string()
      .describe('The ID of the message to remove labels from'),
    label_ids: z
      .array(z.string())
      .describe('Array of label IDs to remove from the message'),
  },
  async ({ message_id, label_ids }) => {
    try {
      const result = await call(`/users/me/messages/${message_id}/modify`, {
        method: 'POST',
        body: { removeLabelIds: label_ids },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_trash_message --------------------------------------------------

server.tool(
  'gmail_trash_message',
  'Move a Gmail message to the Trash. The message can be recovered from Trash within 30 days.',
  {
    message_id: z
      .string()
      .describe('The ID of the message to move to trash'),
  },
  async ({ message_id }) => {
    try {
      const result = await call(`/users/me/messages/${message_id}/trash`, {
        method: 'POST',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_star_message ---------------------------------------------------

server.tool(
  'gmail_star_message',
  'Star a Gmail message by adding the STARRED label. Starred messages appear in the Starred folder.',
  {
    message_id: z
      .string()
      .describe('The ID of the message to star'),
  },
  async ({ message_id }) => {
    try {
      const result = await call(`/users/me/messages/${message_id}/modify`, {
        method: 'POST',
        body: { addLabelIds: ['STARRED'] },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_create_draft ---------------------------------------------------

server.tool(
  'gmail_create_draft',
  'Create a new email draft in Gmail. The draft can later be sent with gmail_send_draft. Returns the created draft metadata.',
  {
    to: z
      .string()
      .describe('Recipient email address (or comma-separated for multiple recipients)'),
    subject: z
      .string()
      .describe('Email subject line'),
    body: z
      .string()
      .describe('Email body text'),
    cc: z
      .string()
      .optional()
      .describe('CC recipients (comma-separated email addresses)'),
    bcc: z
      .string()
      .optional()
      .describe('BCC recipients (comma-separated email addresses)'),
    content_type: z
      .enum(['text/plain', 'text/html'])
      .optional()
      .describe('Content type of the email body (default: text/plain)'),
    thread_id: z
      .string()
      .optional()
      .describe('Gmail thread ID to associate this draft with (for reply drafts)'),
  },
  async ({ to, subject, body, cc, bcc, content_type, thread_id }) => {
    try {
      const raw = buildRawEmail({ to, subject, body, cc, bcc, content_type })
      const message: Record<string, unknown> = { raw }
      if (thread_id) message.threadId = thread_id

      const result = await call('/users/me/drafts', {
        method: 'POST',
        body: { message },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_send_draft -----------------------------------------------------

server.tool(
  'gmail_send_draft',
  'Send an existing Gmail draft. The draft is removed from the drafts list and the message appears in Sent Mail.',
  {
    draft_id: z
      .string()
      .describe('The ID of the draft to send'),
  },
  async ({ draft_id }) => {
    try {
      const result = await call('/users/me/drafts/send', {
        method: 'POST',
        body: { id: draft_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_list_drafts ----------------------------------------------------

server.tool(
  'gmail_list_drafts',
  'List drafts in the authenticated user\'s Gmail account. Returns draft IDs and message metadata.',
  {
    max_results: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of drafts to return (1-500, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous list response for pagination'),
  },
  async ({ max_results, page_token }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (max_results !== undefined) query.maxResults = String(max_results)
      if (page_token) query.pageToken = page_token

      const result = await call('/users/me/drafts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_get_thread -----------------------------------------------------

server.tool(
  'gmail_get_thread',
  'Get a Gmail thread by its ID. Returns all messages in the conversation thread.',
  {
    thread_id: z
      .string()
      .describe('The ID of the thread to retrieve'),
    format: z
      .enum(['full', 'metadata', 'minimal'])
      .optional()
      .describe('Format for messages in the thread: full (default), metadata, or minimal'),
  },
  async ({ thread_id, format }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (format) query.format = format

      const result = await call(`/users/me/threads/${thread_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gmail_list_threads ---------------------------------------------------

server.tool(
  'gmail_list_threads',
  'List email threads in the authenticated user\'s mailbox. Threads group related messages together. Returns thread IDs and snippets.',
  {
    max_results: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of threads to return (1-500, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous list response for pagination'),
    q: z
      .string()
      .optional()
      .describe('Gmail search query to filter threads (e.g. "is:unread", "from:user@example.com")'),
    label_ids: z
      .array(z.string())
      .optional()
      .describe('Only return threads where all messages have all of these label IDs'),
    include_spam_trash: z
      .boolean()
      .optional()
      .describe('Whether to include threads from SPAM and TRASH (default false)'),
  },
  async ({ max_results, page_token, q, label_ids, include_spam_trash }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (max_results !== undefined) query.maxResults = String(max_results)
      if (page_token) query.pageToken = page_token
      if (q) query.q = q
      if (label_ids) query.labelIds = label_ids.join(',')
      if (include_spam_trash !== undefined) query.includeSpamTrash = String(include_spam_trash)

      const result = await call('/users/me/threads', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
