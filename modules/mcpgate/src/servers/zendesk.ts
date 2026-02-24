/**
 * Zendesk MCP Server -- Production-ready
 *
 * Provides tools to interact with the Zendesk Support API on behalf of the
 * authenticated agent.  Credentials are injected via the ZENDESK_TOKEN
 * environment variable and the subdomain via ZENDESK_SUBDOMAIN (set by the
 * MCPGate gateway).
 *
 * Tools:
 *   zendesk_create_ticket           -- Create a new ticket
 *   zendesk_get_ticket              -- Get a single ticket
 *   zendesk_update_ticket           -- Update a ticket
 *   zendesk_list_tickets            -- List tickets
 *   zendesk_search_tickets          -- Search tickets using Zendesk query
 *   zendesk_add_comment             -- Add a comment to a ticket
 *   zendesk_list_users              -- List users
 *   zendesk_get_user                -- Get a single user
 *   zendesk_create_user             -- Create a user
 *   zendesk_list_organizations      -- List organizations
 *   zendesk_list_groups             -- List groups
 *   zendesk_get_satisfaction_ratings -- Get satisfaction ratings
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client -- dynamic base URL from ZENDESK_SUBDOMAIN env
// ---------------------------------------------------------------------------

const subdomain = process.env.ZENDESK_SUBDOMAIN || 'support'
const baseUrl = `https://${subdomain}.zendesk.com/api/v2`

const { call, categoriseError } = createApiClient({
  name: 'zendesk',
  baseUrl,
  tokenEnvVar: 'ZENDESK_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zendesk-mcp',
  version: '0.1.0',
})

// ---- zendesk_create_ticket ------------------------------------------------

server.tool(
  'zendesk_create_ticket',
  'Create a new support ticket in Zendesk. Returns the created ticket object with its ID, status, and other metadata.',
  {
    subject: z.string().describe('Ticket subject line'),
    description: z.string().describe('Ticket description / initial comment body'),
    requester_email: z
      .string()
      .optional()
      .describe('Email of the requester (creates or matches an existing user)'),
    requester_name: z
      .string()
      .optional()
      .describe('Name of the requester'),
    priority: z
      .enum(['urgent', 'high', 'normal', 'low'])
      .optional()
      .describe('Ticket priority level'),
    type: z
      .enum(['problem', 'incident', 'question', 'task'])
      .optional()
      .describe('Ticket type classification'),
    status: z
      .enum(['new', 'open', 'pending', 'hold', 'solved', 'closed'])
      .optional()
      .describe('Initial ticket status (default "new")'),
    assignee_id: z
      .number()
      .int()
      .optional()
      .describe('Agent ID to assign the ticket to'),
    group_id: z
      .number()
      .int()
      .optional()
      .describe('Group ID to assign the ticket to'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tags to apply to the ticket'),
    custom_fields: z
      .array(
        z.object({
          id: z.number().int().describe('Custom field ID'),
          value: z.unknown().describe('Custom field value'),
        }),
      )
      .optional()
      .describe('Array of custom field values'),
  },
  async ({ subject, description, requester_email, requester_name, priority, type, status, assignee_id, group_id, tags, custom_fields }) => {
    try {
      const ticket: Record<string, unknown> = {
        subject,
        comment: { body: description },
      }

      if (requester_email || requester_name) {
        const requester: Record<string, string> = {}
        if (requester_email) requester.email = requester_email
        if (requester_name) requester.name = requester_name
        ticket.requester = requester
      }

      if (priority !== undefined) ticket.priority = priority
      if (type !== undefined) ticket.type = type
      if (status !== undefined) ticket.status = status
      if (assignee_id !== undefined) ticket.assignee_id = assignee_id
      if (group_id !== undefined) ticket.group_id = group_id
      if (tags !== undefined) ticket.tags = tags
      if (custom_fields !== undefined) ticket.custom_fields = custom_fields

      const result = await call('/tickets', {
        method: 'POST',
        body: { ticket },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_get_ticket ---------------------------------------------------

server.tool(
  'zendesk_get_ticket',
  'Retrieve a single Zendesk ticket by its ID. Returns the full ticket object including subject, description, status, assignee, and tags.',
  {
    ticket_id: z.number().int().describe('The Zendesk ticket ID'),
  },
  async ({ ticket_id }) => {
    try {
      const result = await call(`/tickets/${ticket_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_update_ticket ------------------------------------------------

server.tool(
  'zendesk_update_ticket',
  'Update an existing Zendesk ticket. Only provided fields are changed. Can update status, priority, assignee, tags, and custom fields. Returns the updated ticket.',
  {
    ticket_id: z.number().int().describe('The Zendesk ticket ID to update'),
    subject: z.string().optional().describe('New ticket subject'),
    status: z
      .enum(['new', 'open', 'pending', 'hold', 'solved', 'closed'])
      .optional()
      .describe('New ticket status'),
    priority: z
      .enum(['urgent', 'high', 'normal', 'low'])
      .optional()
      .describe('New priority level'),
    type: z
      .enum(['problem', 'incident', 'question', 'task'])
      .optional()
      .describe('New ticket type'),
    assignee_id: z
      .number()
      .int()
      .optional()
      .describe('New assignee agent ID'),
    group_id: z
      .number()
      .int()
      .optional()
      .describe('New group ID'),
    tags: z
      .array(z.string())
      .optional()
      .describe('New tags (replaces existing tags)'),
    custom_fields: z
      .array(
        z.object({
          id: z.number().int().describe('Custom field ID'),
          value: z.unknown().describe('Custom field value'),
        }),
      )
      .optional()
      .describe('Custom field values to update'),
  },
  async ({ ticket_id, subject, status, priority, type, assignee_id, group_id, tags, custom_fields }) => {
    try {
      const ticket: Record<string, unknown> = {}
      if (subject !== undefined) ticket.subject = subject
      if (status !== undefined) ticket.status = status
      if (priority !== undefined) ticket.priority = priority
      if (type !== undefined) ticket.type = type
      if (assignee_id !== undefined) ticket.assignee_id = assignee_id
      if (group_id !== undefined) ticket.group_id = group_id
      if (tags !== undefined) ticket.tags = tags
      if (custom_fields !== undefined) ticket.custom_fields = custom_fields

      const result = await call(`/tickets/${ticket_id}`, {
        method: 'PUT',
        body: { ticket },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_list_tickets -------------------------------------------------

server.tool(
  'zendesk_list_tickets',
  'List tickets in Zendesk. Returns paginated ticket objects. Can be filtered to show recent, assigned, or all tickets.',
  {
    sort_by: z
      .enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_type'])
      .optional()
      .describe('Field to sort results by'),
    sort_order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order: "asc" or "desc"'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of tickets per page (1-100, default 100)'),
    external_id: z
      .string()
      .optional()
      .describe('Filter by external ID'),
  },
  async ({ sort_by, sort_order, page, per_page, external_id }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (sort_by !== undefined) query.sort_by = sort_by
      if (sort_order !== undefined) query.sort_order = sort_order
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)
      if (external_id !== undefined) query.external_id = external_id

      const result = await call('/tickets', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_search_tickets -----------------------------------------------

server.tool(
  'zendesk_search_tickets',
  'Search for tickets using the Zendesk search API. Supports the full Zendesk search syntax including status, priority, assignee, tags, and date filters.',
  {
    query: z
      .string()
      .describe('Zendesk search query (e.g. "type:ticket status:open priority:urgent", "subject:refund created>2024-01-01")'),
    sort_by: z
      .enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_type'])
      .optional()
      .describe('Field to sort results by'),
    sort_order: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100)'),
  },
  async ({ query, sort_by, sort_order, page, per_page }) => {
    try {
      const qp: Record<string, string | undefined> = {
        query,
      }
      if (sort_by !== undefined) qp.sort_by = sort_by
      if (sort_order !== undefined) qp.sort_order = sort_order
      if (page !== undefined) qp.page = String(page)
      if (per_page !== undefined) qp.per_page = String(per_page)

      const result = await call('/search.json', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_add_comment --------------------------------------------------

server.tool(
  'zendesk_add_comment',
  'Add a comment to a Zendesk ticket. Can be a public reply or an internal note. Returns the updated ticket.',
  {
    ticket_id: z.number().int().describe('The Zendesk ticket ID to add the comment to'),
    body: z.string().describe('Comment body text (HTML supported)'),
    public: z
      .boolean()
      .optional()
      .describe('Whether the comment is public (visible to requester) or internal (default true)'),
    author_id: z
      .number()
      .int()
      .optional()
      .describe('User ID of the comment author (defaults to the authenticated user)'),
  },
  async ({ ticket_id, body, public: isPublic, author_id }) => {
    try {
      const comment: Record<string, unknown> = { body }
      if (isPublic !== undefined) comment.public = isPublic
      if (author_id !== undefined) comment.author_id = author_id

      const result = await call(`/tickets/${ticket_id}`, {
        method: 'PUT',
        body: { ticket: { comment } },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_list_users ---------------------------------------------------

server.tool(
  'zendesk_list_users',
  'List users in Zendesk. Returns user profiles including agents, end-users, and admins. Results are paginated.',
  {
    role: z
      .enum(['end-user', 'agent', 'admin'])
      .optional()
      .describe('Filter by user role'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of users per page (1-100, default 100)'),
  },
  async ({ role, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (role !== undefined) query.role = role
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call('/users', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_get_user -----------------------------------------------------

server.tool(
  'zendesk_get_user',
  'Retrieve a single Zendesk user by their ID. Returns the user profile including name, email, role, and organization.',
  {
    user_id: z.number().int().describe('The Zendesk user ID'),
  },
  async ({ user_id }) => {
    try {
      const result = await call(`/users/${user_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_create_user --------------------------------------------------

server.tool(
  'zendesk_create_user',
  'Create a new user in Zendesk. Returns the created user object with their ID.',
  {
    name: z.string().describe('User full name'),
    email: z.string().describe('User email address'),
    role: z
      .enum(['end-user', 'agent', 'admin'])
      .optional()
      .describe('User role (default "end-user")'),
    phone: z.string().optional().describe('User phone number'),
    organization_id: z
      .number()
      .int()
      .optional()
      .describe('Organization ID to associate the user with'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tags to apply to the user'),
    verified: z
      .boolean()
      .optional()
      .describe('Whether the user is verified (default false)'),
    external_id: z
      .string()
      .optional()
      .describe('External ID for integrating with other systems'),
  },
  async ({ name, email, role, phone, organization_id, tags, verified, external_id }) => {
    try {
      const user: Record<string, unknown> = { name, email }
      if (role !== undefined) user.role = role
      if (phone !== undefined) user.phone = phone
      if (organization_id !== undefined) user.organization_id = organization_id
      if (tags !== undefined) user.tags = tags
      if (verified !== undefined) user.verified = verified
      if (external_id !== undefined) user.external_id = external_id

      const result = await call('/users', {
        method: 'POST',
        body: { user },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_list_organizations -------------------------------------------

server.tool(
  'zendesk_list_organizations',
  'List organizations in Zendesk. Returns organization names, domains, and associated user counts. Results are paginated.',
  {
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of organizations per page (1-100, default 100)'),
  },
  async ({ page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call('/organizations', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_list_groups --------------------------------------------------

server.tool(
  'zendesk_list_groups',
  'List agent groups in Zendesk. Returns group names, IDs, and descriptions. Groups are used for ticket routing.',
  {
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of groups per page (1-100, default 100)'),
  },
  async ({ page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call('/groups', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zendesk_get_satisfaction_ratings -------------------------------------

server.tool(
  'zendesk_get_satisfaction_ratings',
  'Get customer satisfaction ratings from Zendesk. Returns CSAT scores, comments, and associated ticket information.',
  {
    score: z
      .enum(['offered', 'unoffered', 'good', 'bad'])
      .optional()
      .describe('Filter by satisfaction score'),
    start_time: z
      .number()
      .int()
      .optional()
      .describe('Only return ratings created after this Unix timestamp'),
    end_time: z
      .number()
      .int()
      .optional()
      .describe('Only return ratings created before this Unix timestamp'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of ratings per page (1-100, default 100)'),
  },
  async ({ score, start_time, end_time, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (score !== undefined) query.score = score
      if (start_time !== undefined) query.start_time = String(start_time)
      if (end_time !== undefined) query.end_time = String(end_time)
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call('/satisfaction_ratings', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
