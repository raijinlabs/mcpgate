/**
 * Google Calendar MCP Server -- Production-ready
 *
 * Provides tools to interact with the Google Calendar API on behalf of the
 * authenticated user.  Credentials are injected via the GOOGLE_CALENDAR_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   gcal_list_events       -- List events from a calendar
 *   gcal_create_event      -- Create a new calendar event
 *   gcal_get_event         -- Get a single calendar event
 *   gcal_update_event      -- Update an existing calendar event
 *   gcal_delete_event      -- Delete a calendar event
 *   gcal_list_calendars    -- List calendars for the authenticated user
 *   gcal_get_calendar      -- Get calendar details
 *   gcal_create_calendar   -- Create a new calendar
 *   gcal_quick_add         -- Quick-add an event using natural language
 *   gcal_get_freebusy      -- Query free/busy information
 *   gcal_move_event        -- Move an event to another calendar
 *   gcal_update_calendar   -- Update calendar metadata
 *   gcal_delete_calendar   -- Delete a calendar
 *   gcal_list_colors       -- List available calendar and event colors
 *   gcal_watch_events      -- Set up push notifications for calendar events
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GCAL_TOKEN = process.env.GOOGLE_CALENDAR_TOKEN || ''
const GCAL_API = 'https://www.googleapis.com/calendar/v3'
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

interface ApiErrorDetail {
  status: number
  body: string
  retryAfterMs?: number
}

class GoogleCalendarApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(detail: ApiErrorDetail) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'Google server error'
            : 'Google Calendar API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'GoogleCalendarApiError'
    this.status = detail.status
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof GoogleCalendarApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Google Calendar token may be invalid or missing required scopes. Reconnect via /v1/auth/connect/google-calendar',
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
        hint: 'Google is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// API helper with retry on rate-limit
// ---------------------------------------------------------------------------

async function gcalApi(
  path: string,
  opts: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<unknown> {
  if (!GCAL_TOKEN) {
    throw new Error(
      'Google Calendar token not configured. Connect via /v1/auth/connect/google-calendar',
    )
  }

  const res = await fetch(`${GCAL_API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${GCAL_TOKEN}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  // Rate-limit awareness: retry if under budget
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000

    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return gcalApi(path, opts, attempt + 1)
    }

    const body = await res.text()
    throw new GoogleCalendarApiError({ status: 429, body, retryAfterMs: retryMs })
  }

  if (!res.ok) {
    const body = await res.text()
    throw new GoogleCalendarApiError({ status: res.status, body })
  }

  // 204 No Content
  if (res.status === 204) return {}
  return res.json()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect all-day events: matches YYYY-MM-DD with no time component. */
const ALL_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function buildDateField(value: string) {
  return ALL_DAY_RE.test(value) ? { date: value } : { dateTime: value }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'google-calendar-mcp',
  version: '0.1.0',
})

// ---- gcal_list_events -----------------------------------------------------

server.tool(
  'gcal_list_events',
  'List events from a Google Calendar. Returns events sorted by start time. Supports time range filtering and free-text search.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    time_min: z
      .string()
      .optional()
      .describe('Lower bound (inclusive) for event start time in ISO 8601 format'),
    time_max: z
      .string()
      .optional()
      .describe('Upper bound (exclusive) for event start time in ISO 8601 format'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(2500)
      .optional()
      .default(10)
      .describe('Maximum number of events to return (default: 10)'),
    q: z
      .string()
      .optional()
      .describe('Free-text search terms to find events'),
  },
  async ({ calendar_id, time_min, time_max, max_results, q }) => {
    try {
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
      })
      if (time_min) params.set('timeMin', time_min)
      if (time_max) params.set('timeMax', time_max)
      if (max_results !== undefined) params.set('maxResults', String(max_results))
      if (q) params.set('q', q)

      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events?${params.toString()}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_create_event ----------------------------------------------------

server.tool(
  'gcal_create_event',
  'Create a new event in a Google Calendar. Supports all-day events (YYYY-MM-DD) and timed events (ISO 8601 datetime). Returns the created event.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    summary: z.string().describe('Event title'),
    start: z
      .string()
      .describe('Start date (YYYY-MM-DD for all-day) or datetime (ISO 8601)'),
    end: z
      .string()
      .describe('End date (YYYY-MM-DD for all-day) or datetime (ISO 8601)'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    attendees: z
      .array(z.string())
      .optional()
      .describe('Array of attendee email addresses'),
  },
  async ({ calendar_id, summary, start, end, description, location, attendees }) => {
    try {
      const payload: Record<string, unknown> = {
        summary,
        start: buildDateField(start),
        end: buildDateField(end),
      }
      if (description !== undefined) payload.description = description
      if (location !== undefined) payload.location = location
      if (attendees !== undefined) payload.attendees = attendees.map((email) => ({ email }))

      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events`,
        { method: 'POST', body: payload },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_get_event -------------------------------------------------------

server.tool(
  'gcal_get_event',
  'Get detailed information about a single Google Calendar event.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID'),
  },
  async ({ calendar_id, event_id }) => {
    try {
      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_update_event ----------------------------------------------------

server.tool(
  'gcal_update_event',
  'Update an existing Google Calendar event. Only provided fields will be changed (PATCH). Returns the updated event.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID to update'),
    summary: z.string().optional().describe('New event title'),
    start: z
      .string()
      .optional()
      .describe('New start date (YYYY-MM-DD for all-day) or datetime (ISO 8601)'),
    end: z
      .string()
      .optional()
      .describe('New end date (YYYY-MM-DD for all-day) or datetime (ISO 8601)'),
    description: z.string().optional().describe('New event description'),
    location: z.string().optional().describe('New event location'),
    attendees: z
      .array(z.string())
      .optional()
      .describe('New list of attendee email addresses (replaces existing)'),
  },
  async ({ calendar_id, event_id, summary, start, end, description, location, attendees }) => {
    try {
      const payload: Record<string, unknown> = {}
      if (summary !== undefined) payload.summary = summary
      if (start !== undefined) payload.start = buildDateField(start)
      if (end !== undefined) payload.end = buildDateField(end)
      if (description !== undefined) payload.description = description
      if (location !== undefined) payload.location = location
      if (attendees !== undefined) payload.attendees = attendees.map((email) => ({ email }))

      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        { method: 'PATCH', body: payload },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_delete_event ----------------------------------------------------

server.tool(
  'gcal_delete_event',
  'Delete an event from a Google Calendar. Returns confirmation on success.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID to delete'),
  },
  async ({ calendar_id, event_id }) => {
    try {
      await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        { method: 'DELETE' },
      )
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_list_calendars --------------------------------------------------

server.tool(
  'gcal_list_calendars',
  'List calendars for the authenticated Google user. Returns calendar names, IDs, and access roles.',
  {
    max_results: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .default(100)
      .describe('Maximum number of calendars to return (default: 100)'),
  },
  async ({ max_results }) => {
    try {
      const params = new URLSearchParams()
      if (max_results !== undefined) params.set('maxResults', String(max_results))

      const qs = params.toString()
      const result = await gcalApi(`/users/me/calendarList${qs ? `?${qs}` : ''}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_get_calendar ----------------------------------------------------

server.tool(
  'gcal_get_calendar',
  'Get detailed information about a Google Calendar including its timezone and description.',
  {
    calendar_id: z.string().describe('Calendar ID'),
  },
  async ({ calendar_id }) => {
    try {
      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_create_calendar -------------------------------------------------

server.tool(
  'gcal_create_calendar',
  'Create a new Google Calendar. Returns the created calendar including its ID.',
  {
    summary: z.string().describe('Calendar name'),
    description: z.string().optional().describe('Calendar description'),
    time_zone: z
      .string()
      .optional()
      .describe('IANA timezone for the calendar (e.g. "America/New_York")'),
  },
  async ({ summary, description, time_zone }) => {
    try {
      const payload: Record<string, unknown> = { summary }
      if (description !== undefined) payload.description = description
      if (time_zone !== undefined) payload.timeZone = time_zone

      const result = await gcalApi('/calendars', {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_quick_add -------------------------------------------------------

server.tool(
  'gcal_quick_add',
  'Quickly add an event using natural language text (e.g. "Lunch with John tomorrow at noon"). Returns the created event.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID (default: "primary")'),
    text: z
      .string()
      .describe('Natural language description of the event to create'),
  },
  async ({ calendar_id, text }) => {
    try {
      const params = new URLSearchParams({ text })
      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/quickAdd?${params.toString()}`,
        { method: 'POST' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_get_freebusy ----------------------------------------------------

server.tool(
  'gcal_get_freebusy',
  'Query free/busy information for one or more calendars within a time range. Useful for scheduling.',
  {
    time_min: z
      .string()
      .describe('Start of the time range in ISO 8601 format'),
    time_max: z
      .string()
      .describe('End of the time range in ISO 8601 format'),
    calendar_ids: z
      .array(z.string())
      .optional()
      .default(['primary'])
      .describe('Array of calendar IDs to query (default: ["primary"])'),
  },
  async ({ time_min, time_max, calendar_ids }) => {
    try {
      const result = await gcalApi('/freeBusy', {
        method: 'POST',
        body: {
          timeMin: time_min,
          timeMax: time_max,
          items: calendar_ids.map((id) => ({ id })),
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_move_event ------------------------------------------------------

server.tool(
  'gcal_move_event',
  'Move an event from one Google Calendar to another. Returns the updated event.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Source calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID to move'),
    destination_calendar_id: z
      .string()
      .describe('Destination calendar ID'),
  },
  async ({ calendar_id, event_id, destination_calendar_id }) => {
    try {
      const params = new URLSearchParams({ destination: destination_calendar_id })
      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}/move?${params.toString()}`,
        { method: 'POST' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_update_calendar -------------------------------------------------

server.tool(
  'gcal_update_calendar',
  'Update metadata for a Google Calendar. Only provided fields will be changed (PATCH). Returns the updated calendar.',
  {
    calendar_id: z.string().describe('Calendar ID to update'),
    summary: z.string().optional().describe('New calendar name'),
    description: z.string().optional().describe('New calendar description'),
    time_zone: z
      .string()
      .optional()
      .describe('New IANA timezone for the calendar (e.g. "America/New_York")'),
  },
  async ({ calendar_id, summary, description, time_zone }) => {
    try {
      const payload: Record<string, unknown> = {}
      if (summary !== undefined) payload.summary = summary
      if (description !== undefined) payload.description = description
      if (time_zone !== undefined) payload.timeZone = time_zone

      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}`,
        { method: 'PATCH', body: payload },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_delete_calendar -------------------------------------------------

server.tool(
  'gcal_delete_calendar',
  'Delete a Google Calendar. This action cannot be undone. Returns confirmation on success.',
  {
    calendar_id: z.string().describe('Calendar ID to delete'),
  },
  async ({ calendar_id }) => {
    try {
      await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}`,
        { method: 'DELETE' },
      )
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_list_colors -----------------------------------------------------

server.tool(
  'gcal_list_colors',
  'List the available color definitions for Google Calendar events and calendars. Returns color IDs mapped to their background and foreground hex values.',
  {},
  async () => {
    try {
      const result = await gcalApi('/colors')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gcal_watch_events ----------------------------------------------------

server.tool(
  'gcal_watch_events',
  'Set up push notifications (webhooks) for changes to events in a Google Calendar. Returns the watch channel details.',
  {
    calendar_id: z
      .string()
      .optional()
      .default('primary')
      .describe('Calendar ID to watch (default: "primary")'),
    webhook_url: z
      .string()
      .describe('HTTPS URL that will receive push notifications'),
    channel_id: z
      .string()
      .describe('Unique identifier for this notification channel'),
  },
  async ({ calendar_id, webhook_url, channel_id }) => {
    try {
      const result = await gcalApi(
        `/calendars/${encodeURIComponent(calendar_id)}/events/watch`,
        {
          method: 'POST',
          body: {
            id: channel_id,
            type: 'web_hook',
            address: webhook_url,
          },
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
