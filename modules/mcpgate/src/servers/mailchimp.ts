/**
 * Mailchimp MCP Server -- Production-ready
 *
 * Provides tools to interact with the Mailchimp Marketing API v3 on behalf of
 * the authenticated user.  Credentials are injected via the MAILCHIMP_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * The data center (dc) is parsed from the API key (e.g. "xxxxx-us21" => "us21").
 *
 * Tools:
 *   mailchimp_list_lists      -- List audience lists
 *   mailchimp_get_list        -- Get a single audience list
 *   mailchimp_add_member      -- Add a member to a list
 *   mailchimp_update_member   -- Update a list member
 *   mailchimp_list_members    -- List members in a list
 *   mailchimp_list_campaigns  -- List campaigns
 *   mailchimp_create_campaign -- Create a campaign
 *   mailchimp_send_campaign   -- Send a campaign
 *   mailchimp_get_campaign_report -- Get campaign report
 *   mailchimp_list_templates  -- List email templates
 *   mailchimp_search_members  -- Search members across all lists
 *   mailchimp_list_segments   -- List segments for a list
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function getDc(): string {
  return (process.env.MAILCHIMP_TOKEN || '').split('-').pop() || 'us1'
}

function makeClient() {
  const dc = getDc()
  return createApiClient({
    name: 'mailchimp',
    baseUrl: `https://${dc}.api.mailchimp.com/3.0`,
    tokenEnvVar: 'MAILCHIMP_TOKEN',
    authStyle: 'bearer',
  })
}

async function mailchimpApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const { call } = makeClient()
  return call(path, opts)
}

function getCategoriseError() {
  return makeClient().categoriseError
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'mailchimp-mcp',
  version: '0.1.0',
})

// ---- mailchimp_list_lists -------------------------------------------------

server.tool(
  'mailchimp_list_lists',
  'List all audience lists (mailing lists) in the Mailchimp account. Results are paginated.',
  {
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of lists to return (1-1000, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ count, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (offset !== undefined) query.offset = String(offset)

      const result = await mailchimpApi('/lists', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_get_list ---------------------------------------------------

server.tool(
  'mailchimp_get_list',
  'Get details of a single audience list by ID. Returns list settings, stats, and configuration.',
  {
    list_id: z.string().describe('The unique Mailchimp list/audience ID'),
  },
  async ({ list_id }) => {
    try {
      const result = await mailchimpApi(`/lists/${list_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_add_member -------------------------------------------------

server.tool(
  'mailchimp_add_member',
  'Add a new member (subscriber) to an audience list. Returns the created member object.',
  {
    list_id: z.string().describe('The audience list ID to add the member to'),
    email_address: z.string().describe('Email address of the new member'),
    status: z
      .enum(['subscribed', 'unsubscribed', 'cleaned', 'pending', 'transactional'])
      .describe('Subscription status for the member'),
    merge_fields: z
      .record(z.string())
      .optional()
      .describe('Merge field values (e.g. { "FNAME": "John", "LNAME": "Doe" })'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tag names to assign to the member'),
    language: z
      .string()
      .optional()
      .describe('Two-letter language code (e.g. "en", "fr")'),
  },
  async ({ list_id, email_address, status, merge_fields, tags, language }) => {
    try {
      const body: Record<string, unknown> = { email_address, status }
      if (merge_fields !== undefined) body.merge_fields = merge_fields
      if (tags !== undefined) body.tags = tags
      if (language !== undefined) body.language = language

      const result = await mailchimpApi(`/lists/${list_id}/members`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_update_member ----------------------------------------------

server.tool(
  'mailchimp_update_member',
  'Update an existing member in an audience list. The subscriber_hash is the MD5 hash of the lowercase email address.',
  {
    list_id: z.string().describe('The audience list ID'),
    subscriber_hash: z
      .string()
      .describe('MD5 hash of the lowercase email address, or the email address itself'),
    status: z
      .enum(['subscribed', 'unsubscribed', 'cleaned', 'pending'])
      .optional()
      .describe('New subscription status'),
    merge_fields: z
      .record(z.string())
      .optional()
      .describe('Merge field values to update'),
    language: z
      .string()
      .optional()
      .describe('Two-letter language code'),
  },
  async ({ list_id, subscriber_hash, status, merge_fields, language }) => {
    try {
      const body: Record<string, unknown> = {}
      if (status !== undefined) body.status = status
      if (merge_fields !== undefined) body.merge_fields = merge_fields
      if (language !== undefined) body.language = language

      const result = await mailchimpApi(`/lists/${list_id}/members/${subscriber_hash}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_list_members -----------------------------------------------

server.tool(
  'mailchimp_list_members',
  'List members in an audience list. Results are paginated and can be filtered by status.',
  {
    list_id: z.string().describe('The audience list ID to list members from'),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of members to return (1-1000, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    status: z
      .enum(['subscribed', 'unsubscribed', 'cleaned', 'pending', 'transactional', 'archived'])
      .optional()
      .describe('Filter by subscription status'),
  },
  async ({ list_id, count, offset, status }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (offset !== undefined) query.offset = String(offset)
      if (status !== undefined) query.status = status

      const result = await mailchimpApi(`/lists/${list_id}/members`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_list_campaigns ---------------------------------------------

server.tool(
  'mailchimp_list_campaigns',
  'List email campaigns in the Mailchimp account. Results are paginated and can be filtered by status or type.',
  {
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of campaigns to return (1-1000, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    status: z
      .enum(['save', 'paused', 'schedule', 'sending', 'sent'])
      .optional()
      .describe('Filter campaigns by status'),
    type: z
      .enum(['regular', 'plaintext', 'absplit', 'rss', 'variate'])
      .optional()
      .describe('Filter campaigns by type'),
  },
  async ({ count, offset, status, type }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (offset !== undefined) query.offset = String(offset)
      if (status !== undefined) query.status = status
      if (type !== undefined) query.type = type

      const result = await mailchimpApi('/campaigns', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_create_campaign --------------------------------------------

server.tool(
  'mailchimp_create_campaign',
  'Create a new email campaign. Returns the created campaign object with its ID.',
  {
    type: z
      .enum(['regular', 'plaintext', 'absplit', 'rss', 'variate'])
      .describe('Campaign type'),
    list_id: z.string().describe('The audience list ID to send to'),
    subject_line: z.string().describe('Email subject line'),
    from_name: z.string().describe('The name the campaign email is sent from'),
    reply_to: z.string().describe('Reply-to email address'),
    title: z
      .string()
      .optional()
      .describe('Internal campaign title (defaults to subject line)'),
  },
  async ({ type, list_id, subject_line, from_name, reply_to, title }) => {
    try {
      const body: Record<string, unknown> = {
        type,
        recipients: { list_id },
        settings: {
          subject_line,
          from_name,
          reply_to,
          ...(title !== undefined ? { title } : {}),
        },
      }

      const result = await mailchimpApi('/campaigns', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_send_campaign ----------------------------------------------

server.tool(
  'mailchimp_send_campaign',
  'Send a campaign immediately. The campaign must be in a sendable state. Returns empty on success.',
  {
    campaign_id: z.string().describe('The campaign ID to send'),
  },
  async ({ campaign_id }) => {
    try {
      const result = await mailchimpApi(`/campaigns/${campaign_id}/actions/send`, {
        method: 'POST',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_get_campaign_report ----------------------------------------

server.tool(
  'mailchimp_get_campaign_report',
  'Get the performance report for a sent campaign. Returns opens, clicks, bounces, and other metrics.',
  {
    campaign_id: z.string().describe('The campaign ID to get the report for'),
  },
  async ({ campaign_id }) => {
    try {
      const result = await mailchimpApi(`/reports/${campaign_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_list_templates ---------------------------------------------

server.tool(
  'mailchimp_list_templates',
  'List email templates available in the account. Returns template names, IDs, and types.',
  {
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of templates to return (1-1000, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    type: z
      .enum(['user', 'base', 'gallery'])
      .optional()
      .describe('Filter by template type'),
  },
  async ({ count, offset, type }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (offset !== undefined) query.offset = String(offset)
      if (type !== undefined) query.type = type

      const result = await mailchimpApi('/templates', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_search_members ---------------------------------------------

server.tool(
  'mailchimp_search_members',
  'Search for members across all audience lists. Uses the Mailchimp search endpoint to find members by email or name.',
  {
    query: z.string().describe('Search query (email address or name)'),
    list_id: z
      .string()
      .optional()
      .describe('Optional list ID to restrict search to a single audience'),
  },
  async ({ query, list_id }) => {
    try {
      const q: Record<string, string | undefined> = { query }
      if (list_id !== undefined) q.list_id = list_id

      const result = await mailchimpApi('/search-members', { query: q })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- mailchimp_list_segments ----------------------------------------------

server.tool(
  'mailchimp_list_segments',
  'List segments (saved and auto-update) for an audience list. Returns segment names, IDs, and member counts.',
  {
    list_id: z.string().describe('The audience list ID to list segments for'),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of segments to return (1-1000, default 10)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    type: z
      .enum(['saved', 'static', 'fuzzy'])
      .optional()
      .describe('Filter by segment type'),
  },
  async ({ list_id, count, offset, type }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (offset !== undefined) query.offset = String(offset)
      if (type !== undefined) query.type = type

      const result = await mailchimpApi(`/lists/${list_id}/segments`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

export default server
