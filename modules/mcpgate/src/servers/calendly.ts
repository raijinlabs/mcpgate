/**
 * Calendly MCP Server -- Production-ready
 *
 * Provides tools to interact with the Calendly API v2 on behalf of the
 * authenticated user.  Credentials are injected via the CALENDLY_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   calendly_get_user          -- Get the current authenticated user
 *   calendly_list_events       -- List scheduled events
 *   calendly_get_event         -- Get a single scheduled event
 *   calendly_list_event_types  -- List event types
 *   calendly_list_invitees     -- List invitees for an event
 *   calendly_cancel_event      -- Cancel a scheduled event
 *   calendly_list_webhooks     -- List webhook subscriptions
 *   calendly_create_webhook    -- Create a webhook subscription
 *   calendly_delete_webhook    -- Delete a webhook subscription
 *   calendly_get_availability  -- Get user availability schedules
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'calendly',
  baseUrl: 'https://api.calendly.com',
  tokenEnvVar: 'CALENDLY_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'calendly-mcp',
  version: '0.1.0',
})

// ---- calendly_get_user ----------------------------------------------------

server.tool(
  'calendly_get_user',
  'Get the authenticated Calendly user profile. Returns the user URI, name, email, timezone, and organization. The user URI is needed for many other Calendly API calls.',
  {},
  async () => {
    try {
      const result = await call('/users/me')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_list_events -------------------------------------------------

server.tool(
  'calendly_list_events',
  'List scheduled events for a user or organization. Returns event details including start/end times, event type, and status. Results are paginated.',
  {
    user: z
      .string()
      .describe('The Calendly user URI to list events for (e.g. "https://api.calendly.com/users/XXXXXXXX")'),
    organization: z
      .string()
      .optional()
      .describe('Organization URI to scope the events to'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of events to return per page (1-100, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response'),
    status: z
      .enum(['active', 'canceled'])
      .optional()
      .describe('Filter by event status'),
    min_start_time: z
      .string()
      .optional()
      .describe('Only include events starting at or after this time (ISO 8601)'),
    max_start_time: z
      .string()
      .optional()
      .describe('Only include events starting before this time (ISO 8601)'),
    sort: z
      .string()
      .optional()
      .describe('Sort order (e.g. "start_time:asc" or "start_time:desc")'),
  },
  async ({ user, organization, count, page_token, status, min_start_time, max_start_time, sort }) => {
    try {
      const query: Record<string, string | undefined> = {
        user,
      }
      if (organization !== undefined) query.organization = organization
      if (count !== undefined) query.count = String(count)
      if (page_token !== undefined) query.page_token = page_token
      if (status !== undefined) query.status = status
      if (min_start_time !== undefined) query.min_start_time = min_start_time
      if (max_start_time !== undefined) query.max_start_time = max_start_time
      if (sort !== undefined) query.sort = sort

      const result = await call('/scheduled_events', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_get_event ---------------------------------------------------

server.tool(
  'calendly_get_event',
  'Retrieve a single scheduled event by its UUID. Returns full event details including type, start/end times, location, and cancellation info.',
  {
    event_uuid: z
      .string()
      .describe('The UUID of the scheduled event (from the event URI)'),
  },
  async ({ event_uuid }) => {
    try {
      const result = await call(`/scheduled_events/${event_uuid}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_list_event_types --------------------------------------------

server.tool(
  'calendly_list_event_types',
  'List event types available for a user or organization. Returns event type names, durations, descriptions, and scheduling URLs.',
  {
    user: z
      .string()
      .optional()
      .describe('Calendly user URI to list event types for'),
    organization: z
      .string()
      .optional()
      .describe('Organization URI to list event types for'),
    active: z
      .boolean()
      .optional()
      .describe('Filter by active status (true = active only, false = inactive only)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of event types to return per page (1-100, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response'),
    sort: z
      .string()
      .optional()
      .describe('Sort order (e.g. "name:asc")'),
  },
  async ({ user, organization, active, count, page_token, sort }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (user !== undefined) query.user = user
      if (organization !== undefined) query.organization = organization
      if (active !== undefined) query.active = String(active)
      if (count !== undefined) query.count = String(count)
      if (page_token !== undefined) query.page_token = page_token
      if (sort !== undefined) query.sort = sort

      const result = await call('/event_types', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_list_invitees -----------------------------------------------

server.tool(
  'calendly_list_invitees',
  'List invitees for a scheduled Calendly event. Returns invitee details including name, email, responses to questions, and cancellation info.',
  {
    event_uuid: z
      .string()
      .describe('The UUID of the scheduled event to list invitees for'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of invitees to return per page (1-100, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response'),
    status: z
      .enum(['active', 'canceled'])
      .optional()
      .describe('Filter by invitee status'),
    sort: z
      .string()
      .optional()
      .describe('Sort order (e.g. "created_at:asc")'),
  },
  async ({ event_uuid, count, page_token, status, sort }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (count !== undefined) query.count = String(count)
      if (page_token !== undefined) query.page_token = page_token
      if (status !== undefined) query.status = status
      if (sort !== undefined) query.sort = sort

      const result = await call(`/scheduled_events/${event_uuid}/invitees`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_cancel_event ------------------------------------------------

server.tool(
  'calendly_cancel_event',
  'Cancel a scheduled Calendly event. Sends cancellation notifications to invitees. Returns the cancellation details.',
  {
    event_uuid: z
      .string()
      .describe('The UUID of the scheduled event to cancel'),
    reason: z
      .string()
      .optional()
      .describe('Reason for cancellation (shared with invitees)'),
  },
  async ({ event_uuid, reason }) => {
    try {
      const body: Record<string, unknown> = {}
      if (reason !== undefined) body.reason = reason

      const result = await call(`/scheduled_events/${event_uuid}/cancellation`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_list_webhooks -----------------------------------------------

server.tool(
  'calendly_list_webhooks',
  'List webhook subscriptions for the user or organization. Returns webhook URLs, events, and status.',
  {
    organization: z
      .string()
      .describe('Organization URI to list webhooks for'),
    scope: z
      .enum(['user', 'organization'])
      .describe('Scope of the webhook subscriptions to list'),
    user: z
      .string()
      .optional()
      .describe('User URI (required when scope is "user")'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of webhooks to return per page (1-100, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Pagination token from a previous response'),
  },
  async ({ organization, scope, user, count, page_token }) => {
    try {
      const query: Record<string, string | undefined> = {
        organization,
        scope,
      }
      if (user !== undefined) query.user = user
      if (count !== undefined) query.count = String(count)
      if (page_token !== undefined) query.page_token = page_token

      const result = await call('/webhook_subscriptions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_create_webhook ----------------------------------------------

server.tool(
  'calendly_create_webhook',
  'Create a webhook subscription to receive event notifications. Returns the created webhook with its URI.',
  {
    url: z
      .string()
      .describe('The URL to receive webhook POST requests'),
    events: z
      .array(z.string())
      .describe('Array of event types to subscribe to (e.g. ["invitee.created", "invitee.canceled"])'),
    organization: z
      .string()
      .describe('Organization URI the webhook belongs to'),
    scope: z
      .enum(['user', 'organization'])
      .describe('Scope of the webhook: "user" or "organization"'),
    user: z
      .string()
      .optional()
      .describe('User URI (required when scope is "user")'),
    signing_key: z
      .string()
      .optional()
      .describe('Secret key for verifying webhook signatures'),
  },
  async ({ url, events, organization, scope, user, signing_key }) => {
    try {
      const body: Record<string, unknown> = {
        url,
        events,
        organization,
        scope,
      }
      if (user !== undefined) body.user = user
      if (signing_key !== undefined) body.signing_key = signing_key

      const result = await call('/webhook_subscriptions', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_delete_webhook ----------------------------------------------

server.tool(
  'calendly_delete_webhook',
  'Delete a webhook subscription by its UUID. Returns empty on success.',
  {
    webhook_uuid: z
      .string()
      .describe('The UUID of the webhook subscription to delete'),
  },
  async ({ webhook_uuid }) => {
    try {
      const result = await call(`/webhook_subscriptions/${webhook_uuid}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- calendly_get_availability --------------------------------------------

server.tool(
  'calendly_get_availability',
  'Get user availability schedules. Returns the user\'s availability rules including days, times, and timezone settings.',
  {
    user: z
      .string()
      .describe('Calendly user URI to get availability schedules for'),
  },
  async ({ user }) => {
    try {
      const query: Record<string, string | undefined> = { user }

      const result = await call('/user_availability_schedules', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
