/**
 * SendGrid MCP Server -- Production-ready
 *
 * Provides tools to interact with the SendGrid API on behalf of the
 * authenticated user.  Credentials are injected via the SENDGRID_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   sendgrid_send_email      -- Send a transactional email
 *   sendgrid_list_contacts   -- List marketing contacts
 *   sendgrid_add_contact     -- Add or update a marketing contact
 *   sendgrid_delete_contact  -- Delete marketing contacts by IDs
 *   sendgrid_create_list     -- Create a marketing contact list
 *   sendgrid_list_lists      -- List all marketing contact lists
 *   sendgrid_get_stats       -- Get global email statistics
 *   sendgrid_list_templates  -- List transactional templates
 *   sendgrid_get_template    -- Get a single transactional template
 *   sendgrid_validate_email  -- Validate an email address
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'sendgrid',
  baseUrl: 'https://api.sendgrid.com/v3',
  tokenEnvVar: 'SENDGRID_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'sendgrid-mcp',
  version: '0.1.0',
})

// ---- sendgrid_send_email --------------------------------------------------

server.tool(
  'sendgrid_send_email',
  'Send a transactional email via SendGrid. Supports plain text and HTML content, multiple recipients, and template IDs. Returns the SendGrid response.',
  {
    to: z
      .array(
        z.object({
          email: z.string().describe('Recipient email address'),
          name: z.string().optional().describe('Recipient display name'),
        }),
      )
      .describe('Array of recipient objects with email and optional name'),
    from: z
      .object({
        email: z.string().describe('Sender email address (must be a verified sender)'),
        name: z.string().optional().describe('Sender display name'),
      })
      .describe('Sender object with email and optional name'),
    subject: z.string().describe('Email subject line'),
    text: z.string().optional().describe('Plain text body of the email'),
    html: z.string().optional().describe('HTML body of the email'),
    template_id: z
      .string()
      .optional()
      .describe('SendGrid dynamic template ID to use instead of inline content'),
    dynamic_template_data: z
      .record(z.unknown())
      .optional()
      .describe('Key-value data for dynamic template variable substitution'),
    reply_to: z
      .object({
        email: z.string().describe('Reply-to email address'),
        name: z.string().optional().describe('Reply-to display name'),
      })
      .optional()
      .describe('Reply-to address object'),
  },
  async ({ to, from, subject, text, html, template_id, dynamic_template_data, reply_to }) => {
    try {
      const personalizations: Record<string, unknown>[] = [{ to }]
      if (dynamic_template_data) {
        personalizations[0].dynamic_template_data = dynamic_template_data
      }

      const body: Record<string, unknown> = {
        personalizations,
        from,
        subject,
      }

      if (text || html) {
        const content: { type: string; value: string }[] = []
        if (text) content.push({ type: 'text/plain', value: text })
        if (html) content.push({ type: 'text/html', value: html })
        body.content = content
      }

      if (template_id) body.template_id = template_id
      if (reply_to) body.reply_to = reply_to

      const result = await call('/mail/send', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_list_contacts -----------------------------------------------

server.tool(
  'sendgrid_list_contacts',
  'List all marketing contacts in SendGrid. Returns contact details including email, names, and custom fields. Results may be paginated.',
  {
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of contacts to return per page (1-1000, default 50)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page'),
  },
  async ({ page_size, page_token }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.page_size = String(page_size)
      if (page_token !== undefined) query.page_token = page_token

      const result = await call('/marketing/contacts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_add_contact -------------------------------------------------

server.tool(
  'sendgrid_add_contact',
  'Add or update one or more marketing contacts in SendGrid. If a contact with the same email already exists, it will be updated. Returns a job ID for tracking the import.',
  {
    contacts: z
      .array(
        z.object({
          email: z.string().describe('Contact email address (required, used as identifier)'),
          first_name: z.string().optional().describe('Contact first name'),
          last_name: z.string().optional().describe('Contact last name'),
          city: z.string().optional().describe('Contact city'),
          country: z.string().optional().describe('Contact country'),
          custom_fields: z
            .record(z.string())
            .optional()
            .describe('Custom field key-value pairs'),
        }),
      )
      .describe('Array of contact objects to add or update'),
    list_ids: z
      .array(z.string())
      .optional()
      .describe('Array of list IDs to add the contacts to'),
  },
  async ({ contacts, list_ids }) => {
    try {
      const body: Record<string, unknown> = { contacts }
      if (list_ids !== undefined) body.list_ids = list_ids

      const result = await call('/marketing/contacts', { method: 'PUT', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_delete_contact ----------------------------------------------

server.tool(
  'sendgrid_delete_contact',
  'Delete one or more marketing contacts from SendGrid by their IDs. Returns a job ID for tracking the deletion.',
  {
    ids: z
      .string()
      .describe('Comma-separated list of contact IDs to delete'),
  },
  async ({ ids }) => {
    try {
      const result = await call('/marketing/contacts', {
        method: 'DELETE',
        query: { ids },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_create_list -------------------------------------------------

server.tool(
  'sendgrid_create_list',
  'Create a new marketing contact list in SendGrid. Returns the created list object with its ID.',
  {
    name: z.string().describe('Name of the contact list'),
  },
  async ({ name }) => {
    try {
      const result = await call('/marketing/lists', {
        method: 'POST',
        body: { name },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_list_lists --------------------------------------------------

server.tool(
  'sendgrid_list_lists',
  'List all marketing contact lists in SendGrid. Returns list names, IDs, and contact counts.',
  {
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of lists to return per page (1-1000, default 100)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response to get the next page'),
  },
  async ({ page_size, page_token }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.page_size = String(page_size)
      if (page_token !== undefined) query.page_token = page_token

      const result = await call('/marketing/lists', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_get_stats ---------------------------------------------------

server.tool(
  'sendgrid_get_stats',
  'Get global email statistics from SendGrid. Returns metrics like requests, deliveries, opens, clicks, bounces, and more for a date range.',
  {
    start_date: z
      .string()
      .describe('Start date for the statistics in YYYY-MM-DD format'),
    end_date: z
      .string()
      .optional()
      .describe('End date for the statistics in YYYY-MM-DD format (defaults to today)'),
    aggregated_by: z
      .enum(['day', 'week', 'month'])
      .optional()
      .describe('How to aggregate the statistics: day, week, or month'),
  },
  async ({ start_date, end_date, aggregated_by }) => {
    try {
      const query: Record<string, string | undefined> = {
        start_date,
      }
      if (end_date !== undefined) query.end_date = end_date
      if (aggregated_by !== undefined) query.aggregated_by = aggregated_by

      const result = await call('/stats', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_list_templates ----------------------------------------------

server.tool(
  'sendgrid_list_templates',
  'List transactional email templates in SendGrid. Returns template IDs, names, and versions.',
  {
    generations: z
      .enum(['legacy', 'dynamic'])
      .optional()
      .describe('Filter by template type: "legacy" or "dynamic" (default returns both)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of templates to return per page (1-200, default 18)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response'),
  },
  async ({ generations, page_size, page_token }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (generations !== undefined) query.generations = generations
      if (page_size !== undefined) query.page_size = String(page_size)
      if (page_token !== undefined) query.page_token = page_token

      const result = await call('/templates', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_get_template ------------------------------------------------

server.tool(
  'sendgrid_get_template',
  'Retrieve a single transactional email template by ID. Returns the template with all its versions and content.',
  {
    template_id: z
      .string()
      .describe('The ID of the template to retrieve'),
  },
  async ({ template_id }) => {
    try {
      const result = await call(`/templates/${template_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sendgrid_validate_email ----------------------------------------------

server.tool(
  'sendgrid_validate_email',
  'Validate an email address using SendGrid Email Validation API. Returns validation verdict, score, and detailed checks. Requires Email Validation add-on.',
  {
    email: z
      .string()
      .describe('The email address to validate'),
    source: z
      .string()
      .optional()
      .describe('An identifier for the source of the validation request (e.g. "signup_form")'),
  },
  async ({ email, source }) => {
    try {
      const body: Record<string, unknown> = { email }
      if (source !== undefined) body.source = source

      const result = await call('/validations/email', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
