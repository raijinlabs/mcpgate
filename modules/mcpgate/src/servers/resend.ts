/**
 * Resend MCP Server -- Production-ready
 *
 * Provides tools to interact with the Resend API on behalf of the
 * authenticated user.  Credentials are injected via the RESEND_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   resend_send_email    -- Send a single email
 *   resend_get_email     -- Retrieve an email by ID
 *   resend_list_emails   -- List emails
 *   resend_create_batch  -- Send a batch of emails
 *   resend_get_batch     -- Retrieve a batch by ID
 *   resend_list_domains  -- List all verified domains
 *   resend_add_domain    -- Add a new domain
 *   resend_verify_domain -- Trigger domain verification
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'resend',
  baseUrl: 'https://api.resend.com',
  tokenEnvVar: 'RESEND_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'resend-mcp',
  version: '0.1.0',
})

// ---- resend_send_email ----------------------------------------------------

server.tool(
  'resend_send_email',
  'Send a single email via Resend. Supports HTML and plain text content, CC, BCC, reply-to, and custom headers. Returns the sent email ID.',
  {
    from: z
      .string()
      .describe('Sender email address (e.g. "Acme <onboarding@acme.com>")'),
    to: z
      .array(z.string())
      .describe('Array of recipient email addresses'),
    subject: z
      .string()
      .describe('Email subject line'),
    html: z
      .string()
      .optional()
      .describe('HTML body of the email'),
    text: z
      .string()
      .optional()
      .describe('Plain text body of the email'),
    cc: z
      .array(z.string())
      .optional()
      .describe('Array of CC recipient email addresses'),
    bcc: z
      .array(z.string())
      .optional()
      .describe('Array of BCC recipient email addresses'),
    reply_to: z
      .array(z.string())
      .optional()
      .describe('Array of reply-to email addresses'),
    headers: z
      .record(z.string())
      .optional()
      .describe('Custom email headers as key-value pairs'),
    tags: z
      .array(
        z.object({
          name: z.string().describe('Tag name'),
          value: z.string().describe('Tag value'),
        }),
      )
      .optional()
      .describe('Array of tag objects for email tracking and categorisation'),
  },
  async ({ from, to, subject, html, text, cc, bcc, reply_to, headers, tags }) => {
    try {
      const body: Record<string, unknown> = { from, to, subject }
      if (html !== undefined) body.html = html
      if (text !== undefined) body.text = text
      if (cc !== undefined) body.cc = cc
      if (bcc !== undefined) body.bcc = bcc
      if (reply_to !== undefined) body.reply_to = reply_to
      if (headers !== undefined) body.headers = headers
      if (tags !== undefined) body.tags = tags

      const result = await call('/emails', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_get_email -----------------------------------------------------

server.tool(
  'resend_get_email',
  'Retrieve a single email by its ID. Returns full email details including delivery status, timestamps, and metadata.',
  {
    email_id: z
      .string()
      .describe('The ID of the email to retrieve'),
  },
  async ({ email_id }) => {
    try {
      const result = await call(`/emails/${encodeURIComponent(email_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_list_emails ---------------------------------------------------

server.tool(
  'resend_list_emails',
  'List emails sent through Resend. Returns email IDs, statuses, and metadata. Results may be paginated.',
  {},
  async () => {
    try {
      const result = await call('/emails')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_create_batch --------------------------------------------------

server.tool(
  'resend_create_batch',
  'Send a batch of emails in a single API call. Each email in the batch can have different recipients, content, and settings. Returns batch ID and individual email IDs.',
  {
    emails: z
      .array(
        z.object({
          from: z.string().describe('Sender email address'),
          to: z.array(z.string()).describe('Array of recipient email addresses'),
          subject: z.string().describe('Email subject line'),
          html: z.string().optional().describe('HTML body of the email'),
          text: z.string().optional().describe('Plain text body of the email'),
          cc: z.array(z.string()).optional().describe('Array of CC recipients'),
          bcc: z.array(z.string()).optional().describe('Array of BCC recipients'),
          reply_to: z.array(z.string()).optional().describe('Array of reply-to addresses'),
          headers: z.record(z.string()).optional().describe('Custom email headers'),
        }),
      )
      .describe('Array of email objects to send as a batch'),
  },
  async ({ emails }) => {
    try {
      const result = await call('/emails/batch', { method: 'POST', body: emails })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_get_batch -----------------------------------------------------

server.tool(
  'resend_get_batch',
  'Retrieve a batch of emails by batch ID. Returns the status and details of all emails in the batch.',
  {
    batch_id: z
      .string()
      .describe('The ID of the batch to retrieve'),
  },
  async ({ batch_id }) => {
    try {
      const result = await call(`/emails/batch/${encodeURIComponent(batch_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_list_domains --------------------------------------------------

server.tool(
  'resend_list_domains',
  'List all domains configured in your Resend account. Returns domain names, statuses, and verification records.',
  {},
  async () => {
    try {
      const result = await call('/domains')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_add_domain ----------------------------------------------------

server.tool(
  'resend_add_domain',
  'Add a new sending domain to your Resend account. Returns the domain ID and DNS records required for verification.',
  {
    name: z
      .string()
      .describe('The domain name to add (e.g. "example.com")'),
    region: z
      .enum(['us-east-1', 'eu-west-1', 'sa-east-1'])
      .optional()
      .describe('AWS region for the domain (default: us-east-1)'),
  },
  async ({ name, region }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (region !== undefined) body.region = region

      const result = await call('/domains', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- resend_verify_domain -------------------------------------------------

server.tool(
  'resend_verify_domain',
  'Trigger verification for a domain. Resend will check the DNS records for the domain. Returns the verification status.',
  {
    domain_id: z
      .string()
      .describe('The ID of the domain to verify'),
  },
  async ({ domain_id }) => {
    try {
      const result = await call(`/domains/${encodeURIComponent(domain_id)}/verify`, {
        method: 'POST',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
