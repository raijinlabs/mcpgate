/**
 * Intercom MCP Server -- Production-ready
 *
 * Provides tools to interact with the Intercom API on behalf of the
 * authenticated workspace.  Credentials are injected via the INTERCOM_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Uses Intercom API version 2.10 via the Intercom-Version header.
 *
 * Tools:
 *   intercom_list_contacts      -- List contacts
 *   intercom_get_contact        -- Get a single contact
 *   intercom_create_contact     -- Create a contact
 *   intercom_update_contact     -- Update a contact
 *   intercom_search_contacts    -- Search contacts with filters
 *   intercom_list_conversations -- List conversations
 *   intercom_get_conversation   -- Get a single conversation
 *   intercom_reply_conversation -- Reply to a conversation
 *   intercom_create_message     -- Create an outbound message
 *   intercom_list_tags          -- List tags
 *   intercom_tag_contact        -- Tag or untag a contact
 *   intercom_list_segments      -- List segments
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'intercom',
  baseUrl: 'https://api.intercom.io',
  tokenEnvVar: 'INTERCOM_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: {
    'Intercom-Version': '2.10',
  },
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'intercom-mcp',
  version: '0.1.0',
})

// ---- intercom_list_contacts -----------------------------------------------

server.tool(
  'intercom_list_contacts',
  'List contacts in Intercom. Returns contact profiles including name, email, role (user/lead), and custom attributes. Results are paginated using cursor-based pagination.',
  {
    per_page: z
      .number()
      .int()
      .min(1)
      .max(150)
      .optional()
      .describe('Number of contacts to return per page (1-150, default 50)'),
    starting_after: z
      .string()
      .optional()
      .describe('Cursor for forward pagination (from previous response)'),
  },
  async ({ per_page, starting_after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (per_page !== undefined) query.per_page = String(per_page)
      if (starting_after !== undefined) query.starting_after = starting_after

      const result = await call('/contacts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_get_contact -------------------------------------------------

server.tool(
  'intercom_get_contact',
  'Retrieve a single Intercom contact by their ID. Returns the full contact profile including email, phone, custom attributes, tags, and company associations.',
  {
    contact_id: z.string().describe('The Intercom contact ID'),
  },
  async ({ contact_id }) => {
    try {
      const result = await call(`/contacts/${contact_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_create_contact ----------------------------------------------

server.tool(
  'intercom_create_contact',
  'Create a new contact in Intercom. Can create either a "user" (identified by user_id or email) or a "lead" (anonymous visitor). Returns the created contact.',
  {
    role: z
      .enum(['user', 'lead'])
      .describe('Contact role: "user" for identified users, "lead" for anonymous visitors'),
    email: z
      .string()
      .optional()
      .describe('Contact email address'),
    external_id: z
      .string()
      .optional()
      .describe('External user ID from your system (maps to user_id in Intercom)'),
    name: z
      .string()
      .optional()
      .describe('Contact full name'),
    phone: z
      .string()
      .optional()
      .describe('Contact phone number'),
    avatar: z
      .string()
      .optional()
      .describe('URL to the contact avatar image'),
    custom_attributes: z
      .record(z.unknown())
      .optional()
      .describe('Key-value custom attributes for the contact'),
    signed_up_at: z
      .number()
      .int()
      .optional()
      .describe('Unix timestamp of when the user signed up'),
    last_seen_at: z
      .number()
      .int()
      .optional()
      .describe('Unix timestamp of when the user was last seen'),
  },
  async ({ role, email, external_id, name, phone, avatar, custom_attributes, signed_up_at, last_seen_at }) => {
    try {
      const body: Record<string, unknown> = { role }
      if (email !== undefined) body.email = email
      if (external_id !== undefined) body.external_id = external_id
      if (name !== undefined) body.name = name
      if (phone !== undefined) body.phone = phone
      if (avatar !== undefined) body.avatar = avatar
      if (custom_attributes !== undefined) body.custom_attributes = custom_attributes
      if (signed_up_at !== undefined) body.signed_up_at = signed_up_at
      if (last_seen_at !== undefined) body.last_seen_at = last_seen_at

      const result = await call('/contacts', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_update_contact ----------------------------------------------

server.tool(
  'intercom_update_contact',
  'Update an existing Intercom contact. Only provided fields are changed. Returns the updated contact.',
  {
    contact_id: z.string().describe('The Intercom contact ID to update'),
    email: z.string().optional().describe('New email address'),
    name: z.string().optional().describe('New full name'),
    phone: z.string().optional().describe('New phone number'),
    avatar: z.string().optional().describe('New avatar image URL'),
    custom_attributes: z
      .record(z.unknown())
      .optional()
      .describe('Custom attributes to update (merged with existing attributes)'),
    unsubscribed_from_emails: z
      .boolean()
      .optional()
      .describe('Whether the contact has unsubscribed from emails'),
  },
  async ({ contact_id, email, name, phone, avatar, custom_attributes, unsubscribed_from_emails }) => {
    try {
      const body: Record<string, unknown> = {}
      if (email !== undefined) body.email = email
      if (name !== undefined) body.name = name
      if (phone !== undefined) body.phone = phone
      if (avatar !== undefined) body.avatar = avatar
      if (custom_attributes !== undefined) body.custom_attributes = custom_attributes
      if (unsubscribed_from_emails !== undefined) body.unsubscribed_from_emails = unsubscribed_from_emails

      const result = await call(`/contacts/${contact_id}`, { method: 'PUT', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_search_contacts ---------------------------------------------

server.tool(
  'intercom_search_contacts',
  'Search for contacts in Intercom using filters. Supports complex queries with field, operator, and value combinations. Returns matching contacts.',
  {
    field: z
      .string()
      .describe('Field to search on (e.g. "email", "name", "role", "created_at", "custom_attributes.plan")'),
    operator: z
      .enum(['=', '!=', 'IN', 'NIN', '>', '<', '~', '!~', 'starts_with', 'ends_with', 'contains', 'NOT_contains'])
      .describe('Search operator (= equals, ~ contains, > greater than, etc.)'),
    value: z
      .string()
      .describe('Value to search for'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(150)
      .optional()
      .describe('Number of results per page (1-150, default 50)'),
    starting_after: z
      .string()
      .optional()
      .describe('Cursor for forward pagination'),
  },
  async ({ field, operator, value, per_page, starting_after }) => {
    try {
      const body: Record<string, unknown> = {
        query: {
          field,
          operator,
          value,
        },
      }

      const pagination: Record<string, unknown> = {}
      if (per_page !== undefined) pagination.per_page = per_page
      if (starting_after !== undefined) pagination.starting_after = starting_after
      if (Object.keys(pagination).length > 0) body.pagination = pagination

      const result = await call('/contacts/search', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_list_conversations ------------------------------------------

server.tool(
  'intercom_list_conversations',
  'List conversations in Intercom. Returns conversation summaries including participants, latest message, and status. Results are paginated.',
  {
    per_page: z
      .number()
      .int()
      .min(1)
      .max(150)
      .optional()
      .describe('Number of conversations per page (1-150, default 20)'),
    starting_after: z
      .string()
      .optional()
      .describe('Cursor for forward pagination'),
  },
  async ({ per_page, starting_after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (per_page !== undefined) query.per_page = String(per_page)
      if (starting_after !== undefined) query.starting_after = starting_after

      const result = await call('/conversations', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_get_conversation --------------------------------------------

server.tool(
  'intercom_get_conversation',
  'Retrieve a single conversation by its ID. Returns the full conversation including all messages, participants, tags, and state.',
  {
    conversation_id: z.string().describe('The Intercom conversation ID'),
    display_as: z
      .enum(['plaintext', 'html'])
      .optional()
      .describe('How to render message bodies: "plaintext" or "html" (default "html")'),
  },
  async ({ conversation_id, display_as }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (display_as !== undefined) query.display_as = display_as

      const result = await call(`/conversations/${conversation_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_reply_conversation ------------------------------------------

server.tool(
  'intercom_reply_conversation',
  'Reply to an Intercom conversation. Can send a reply as an admin or on behalf of a contact. Returns the updated conversation.',
  {
    conversation_id: z.string().describe('The Intercom conversation ID to reply to'),
    message_type: z
      .enum(['comment', 'note'])
      .describe('Type of reply: "comment" (visible to customer) or "note" (internal only)'),
    body: z.string().describe('Reply body text (HTML supported)'),
    admin_id: z
      .string()
      .describe('The admin ID sending the reply'),
    attachment_urls: z
      .array(z.string())
      .optional()
      .describe('Array of attachment URLs to include with the reply'),
  },
  async ({ conversation_id, message_type, body, admin_id, attachment_urls }) => {
    try {
      const payload: Record<string, unknown> = {
        message_type,
        body,
        type: 'admin',
        admin_id,
      }
      if (attachment_urls !== undefined) payload.attachment_urls = attachment_urls

      const result = await call(`/conversations/${conversation_id}/reply`, {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_create_message ----------------------------------------------

server.tool(
  'intercom_create_message',
  'Create a new outbound message in Intercom (in-app message or email). Used to proactively message a contact. Returns the created message.',
  {
    message_type: z
      .enum(['inapp', 'email'])
      .describe('Delivery channel: "inapp" for in-app message or "email" for email'),
    subject: z
      .string()
      .optional()
      .describe('Subject line (required for email messages)'),
    body: z.string().describe('Message body (HTML supported)'),
    template: z
      .enum(['plain', 'personal'])
      .optional()
      .describe('Email template style: "plain" or "personal" (default "plain")'),
    from: z
      .object({
        type: z.literal('admin').describe('Must be "admin"'),
        id: z.string().describe('Admin ID of the sender'),
      })
      .describe('Sender object (must be an admin)'),
    to: z
      .object({
        type: z.enum(['user', 'lead']).describe('Contact type: "user" or "lead"'),
        id: z.string().describe('Contact ID of the recipient'),
      })
      .describe('Recipient object'),
    create_conversation_without_contact_reply: z
      .boolean()
      .optional()
      .describe('Whether to create a conversation even without a reply (default false)'),
  },
  async ({ message_type, subject, body, template, from, to, create_conversation_without_contact_reply }) => {
    try {
      const payload: Record<string, unknown> = {
        message_type,
        body,
        from,
        to,
      }
      if (subject !== undefined) payload.subject = subject
      if (template !== undefined) payload.template = template
      if (create_conversation_without_contact_reply !== undefined) {
        payload.create_conversation_without_contact_reply = create_conversation_without_contact_reply
      }

      const result = await call('/messages', { method: 'POST', body: payload })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_list_tags ---------------------------------------------------

server.tool(
  'intercom_list_tags',
  'List all tags in the Intercom workspace. Returns tag IDs and names. Tags can be applied to contacts, conversations, and companies.',
  {},
  async () => {
    try {
      const result = await call('/tags')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_tag_contact -------------------------------------------------

server.tool(
  'intercom_tag_contact',
  'Apply a tag to a contact in Intercom. Creates the association between the tag and the contact. Returns the tag object.',
  {
    contact_id: z.string().describe('The Intercom contact ID to tag'),
    tag_id: z.string().describe('The tag ID to apply to the contact'),
  },
  async ({ contact_id, tag_id }) => {
    try {
      const result = await call(`/contacts/${contact_id}/tags`, {
        method: 'POST',
        body: { id: tag_id },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- intercom_list_segments -----------------------------------------------

server.tool(
  'intercom_list_segments',
  'List all segments in the Intercom workspace. Returns segment IDs, names, types, and person counts. Segments are dynamic groups of contacts based on filter criteria.',
  {
    include_count: z
      .boolean()
      .optional()
      .describe('Whether to include the contact count for each segment'),
  },
  async ({ include_count }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (include_count !== undefined) query.include_count = String(include_count)

      const result = await call('/segments', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
