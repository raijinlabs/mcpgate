/**
 * Freshdesk MCP Server -- Production-ready
 *
 * Provides tools to interact with the Freshdesk REST API v2 on behalf of
 * the authenticated user.  Credentials are injected via the FRESHDESK_TOKEN
 * and FRESHDESK_DOMAIN environment variables (set by the MCPGate gateway).
 *
 * Freshdesk uses HTTP Basic authentication (API key + ":X" as password).
 *
 * Tools:
 *   freshdesk_create_ticket  -- Create a new ticket
 *   freshdesk_get_ticket     -- Get a single ticket
 *   freshdesk_update_ticket  -- Update an existing ticket
 *   freshdesk_list_tickets   -- List tickets
 *   freshdesk_search_tickets -- Search tickets with query
 *   freshdesk_add_note       -- Add a note to a ticket
 *   freshdesk_list_contacts  -- List contacts
 *   freshdesk_create_contact -- Create a new contact
 *   freshdesk_list_agents    -- List agents
 *   freshdesk_list_groups    -- List groups
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class FreshdeskApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(detail: { status: number; body: string; retryAfterMs?: number }) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'Freshdesk server error'
            : 'Freshdesk API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'FreshdeskApiError'
    this.status = detail.status
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof FreshdeskApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Freshdesk API key may be invalid. Check FRESHDESK_TOKEN and FRESHDESK_DOMAIN or reconnect via /v1/auth/connect/freshdesk',
      }
    }
    if (err.status === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Freshdesk is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// API helper with Basic auth (apiKey:X)
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const domain = process.env.FRESHDESK_DOMAIN || ''
  if (!domain) {
    throw new Error(
      'FRESHDESK_DOMAIN not configured. Set it to your Freshdesk subdomain (e.g. "mycompany").',
    )
  }
  return `https://${domain}.freshdesk.com/api/v2`
}

function getBasicAuth(): string {
  const token = process.env.FRESHDESK_TOKEN || ''
  if (!token) {
    throw new Error(
      'FRESHDESK_TOKEN not configured. Set it or connect via /v1/auth/connect/freshdesk',
    )
  }
  return Buffer.from(`${token}:X`).toString('base64')
}

async function freshdeskApi(
  path: string,
  opts: {
    method?: string
    body?: unknown
    query?: Record<string, string | undefined>
  } = {},
  attempt = 0,
): Promise<unknown> {
  const baseUrl = getBaseUrl()
  const basicAuth = getBasicAuth()
  const method = opts.method || 'GET'

  let url = `${baseUrl}${path}`
  if (opts.query) {
    const qp = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) qp.set(k, v)
    }
    const qs = qp.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    'Content-Type': 'application/json',
  }

  let bodyStr: string | undefined
  if (opts.body !== undefined) {
    bodyStr = JSON.stringify(opts.body)
  }

  const res = await fetch(url, { method, headers, body: bodyStr })

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000
    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return freshdeskApi(path, opts, attempt + 1)
    }
    const body = await res.text()
    throw new FreshdeskApiError({ status: 429, body, retryAfterMs: retryMs })
  }

  if (!res.ok) {
    const body = await res.text()
    throw new FreshdeskApiError({ status: res.status, body })
  }

  if (res.status === 204) return {}
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'freshdesk-mcp',
  version: '0.1.0',
})

// ---- freshdesk_create_ticket ----------------------------------------------

server.tool(
  'freshdesk_create_ticket',
  'Create a new support ticket in Freshdesk. Returns the created ticket object with its ID.',
  {
    subject: z.string().describe('Ticket subject line'),
    description: z.string().describe('HTML content of the ticket description'),
    email: z
      .string()
      .optional()
      .describe('Email address of the requester (required if requester_id not provided)'),
    requester_id: z
      .number()
      .int()
      .optional()
      .describe('Freshdesk requester ID (required if email not provided)'),
    priority: z
      .number()
      .int()
      .min(1)
      .max(4)
      .describe('Ticket priority: 1=Low, 2=Medium, 3=High, 4=Urgent'),
    status: z
      .number()
      .int()
      .min(2)
      .max(5)
      .describe('Ticket status: 2=Open, 3=Pending, 4=Resolved, 5=Closed'),
    type: z
      .string()
      .optional()
      .describe('Ticket type (e.g. "Question", "Incident", "Problem")'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tags to apply to the ticket'),
    group_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the agent group to assign the ticket to'),
    responder_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the agent to assign the ticket to'),
  },
  async ({ subject, description, email, requester_id, priority, status, type, tags, group_id, responder_id }) => {
    try {
      const body: Record<string, unknown> = { subject, description, priority, status }
      if (email !== undefined) body.email = email
      if (requester_id !== undefined) body.requester_id = requester_id
      if (type !== undefined) body.type = type
      if (tags !== undefined) body.tags = tags
      if (group_id !== undefined) body.group_id = group_id
      if (responder_id !== undefined) body.responder_id = responder_id

      const result = await freshdeskApi('/tickets', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_get_ticket -------------------------------------------------

server.tool(
  'freshdesk_get_ticket',
  'Retrieve a single Freshdesk ticket by ID. Returns full ticket details including conversations.',
  {
    ticket_id: z.number().int().describe('The Freshdesk ticket ID'),
    include: z
      .string()
      .optional()
      .describe('Comma-separated additional data to include (e.g. "conversations", "requester", "stats")'),
  },
  async ({ ticket_id, include }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (include !== undefined) query.include = include

      const result = await freshdeskApi(`/tickets/${ticket_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_update_ticket ----------------------------------------------

server.tool(
  'freshdesk_update_ticket',
  'Update an existing Freshdesk ticket. Only provided fields are modified.',
  {
    ticket_id: z.number().int().describe('The Freshdesk ticket ID to update'),
    subject: z.string().optional().describe('New ticket subject'),
    description: z.string().optional().describe('New ticket description in HTML'),
    priority: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe('New priority: 1=Low, 2=Medium, 3=High, 4=Urgent'),
    status: z
      .number()
      .int()
      .min(2)
      .max(5)
      .optional()
      .describe('New status: 2=Open, 3=Pending, 4=Resolved, 5=Closed'),
    type: z.string().optional().describe('New ticket type'),
    tags: z.array(z.string()).optional().describe('Replacement tags for the ticket'),
    group_id: z.number().int().optional().describe('New agent group ID'),
    responder_id: z.number().int().optional().describe('New agent ID'),
  },
  async ({ ticket_id, subject, description, priority, status, type, tags, group_id, responder_id }) => {
    try {
      const body: Record<string, unknown> = {}
      if (subject !== undefined) body.subject = subject
      if (description !== undefined) body.description = description
      if (priority !== undefined) body.priority = priority
      if (status !== undefined) body.status = status
      if (type !== undefined) body.type = type
      if (tags !== undefined) body.tags = tags
      if (group_id !== undefined) body.group_id = group_id
      if (responder_id !== undefined) body.responder_id = responder_id

      const result = await freshdeskApi(`/tickets/${ticket_id}`, {
        method: 'PUT',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_list_tickets -----------------------------------------------

server.tool(
  'freshdesk_list_tickets',
  'List tickets in Freshdesk. Results are paginated and can be filtered by various criteria.',
  {
    filter: z
      .enum(['new_and_my_open', 'watching', 'spam', 'deleted'])
      .optional()
      .describe('Predefined ticket filter'),
    requester_id: z
      .number()
      .int()
      .optional()
      .describe('Filter by requester ID'),
    email: z
      .string()
      .optional()
      .describe('Filter by requester email address'),
    updated_since: z
      .string()
      .optional()
      .describe('Filter tickets updated since this date (ISO 8601 format)'),
    order_by: z
      .enum(['created_at', 'due_by', 'updated_at', 'status'])
      .optional()
      .describe('Field to order results by (default: created_at)'),
    order_type: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort order (default: desc)'),
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
      .describe('Number of tickets per page (1-100, default 30)'),
  },
  async ({ filter, requester_id, email, updated_since, order_by, order_type, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter !== undefined) query.filter = filter
      if (requester_id !== undefined) query.requester_id = String(requester_id)
      if (email !== undefined) query.email = email
      if (updated_since !== undefined) query.updated_since = updated_since
      if (order_by !== undefined) query.order_by = order_by
      if (order_type !== undefined) query.order_type = order_type
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await freshdeskApi('/tickets', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_search_tickets ---------------------------------------------

server.tool(
  'freshdesk_search_tickets',
  'Search tickets using Freshdesk query language. Supports filtering by various ticket fields.',
  {
    query: z
      .string()
      .describe('Freshdesk search query (e.g. "priority:3 AND status:2", "tag:\'billing\'")'),
  },
  async ({ query }) => {
    try {
      const result = await freshdeskApi('/search/tickets', {
        query: { query: `"${query}"` },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_add_note ---------------------------------------------------

server.tool(
  'freshdesk_add_note',
  'Add a note (reply or private note) to an existing ticket. Returns the created note.',
  {
    ticket_id: z.number().int().describe('The ticket ID to add the note to'),
    body: z.string().describe('HTML content of the note'),
    private: z
      .boolean()
      .optional()
      .describe('If true, the note is private (only visible to agents). Default false.'),
    notify_emails: z
      .array(z.string())
      .optional()
      .describe('Array of email addresses to notify about this note'),
  },
  async ({ ticket_id, body, private: isPrivate, notify_emails }) => {
    try {
      const reqBody: Record<string, unknown> = { body }
      if (isPrivate !== undefined) reqBody.private = isPrivate
      if (notify_emails !== undefined) reqBody.notify_emails = notify_emails

      const result = await freshdeskApi(`/tickets/${ticket_id}/notes`, {
        method: 'POST',
        body: reqBody,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_list_contacts ----------------------------------------------

server.tool(
  'freshdesk_list_contacts',
  'List contacts in Freshdesk. Results are paginated and can be filtered by email or phone.',
  {
    email: z.string().optional().describe('Filter contacts by email address'),
    phone: z.string().optional().describe('Filter contacts by phone number'),
    mobile: z.string().optional().describe('Filter contacts by mobile number'),
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
      .describe('Number of contacts per page (1-100, default 30)'),
  },
  async ({ email, phone, mobile, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (email !== undefined) query.email = email
      if (phone !== undefined) query.phone = phone
      if (mobile !== undefined) query.mobile = mobile
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await freshdeskApi('/contacts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_create_contact ---------------------------------------------

server.tool(
  'freshdesk_create_contact',
  'Create a new contact in Freshdesk. Returns the created contact object.',
  {
    name: z.string().describe('Full name of the contact'),
    email: z.string().optional().describe('Email address of the contact'),
    phone: z.string().optional().describe('Phone number of the contact'),
    mobile: z.string().optional().describe('Mobile number of the contact'),
    description: z.string().optional().describe('Description or notes about the contact'),
    job_title: z.string().optional().describe('Job title of the contact'),
    company_id: z.number().int().optional().describe('Freshdesk company ID to associate with'),
    tags: z.array(z.string()).optional().describe('Array of tags to assign to the contact'),
  },
  async ({ name, email, phone, mobile, description, job_title, company_id, tags }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (email !== undefined) body.email = email
      if (phone !== undefined) body.phone = phone
      if (mobile !== undefined) body.mobile = mobile
      if (description !== undefined) body.description = description
      if (job_title !== undefined) body.job_title = job_title
      if (company_id !== undefined) body.company_id = company_id
      if (tags !== undefined) body.tags = tags

      const result = await freshdeskApi('/contacts', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_list_agents ------------------------------------------------

server.tool(
  'freshdesk_list_agents',
  'List agents in Freshdesk. Returns agent details including email, role, and group membership.',
  {
    email: z.string().optional().describe('Filter agents by email address'),
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
      .describe('Number of agents per page (1-100, default 30)'),
  },
  async ({ email, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (email !== undefined) query.email = email
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await freshdeskApi('/agents', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- freshdesk_list_groups ------------------------------------------------

server.tool(
  'freshdesk_list_groups',
  'List agent groups in Freshdesk. Returns group details including name, description, and agent IDs.',
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
      .describe('Number of groups per page (1-100, default 30)'),
  },
  async ({ page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await freshdeskApi('/groups', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
