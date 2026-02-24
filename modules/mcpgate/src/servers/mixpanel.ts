/**
 * Mixpanel MCP Server -- Production-ready
 *
 * Provides tools to interact with the Mixpanel API on behalf of the
 * authenticated project.  Credentials are injected via the MIXPANEL_TOKEN
 * environment variable (the API secret, used for Basic auth).
 *
 * Mixpanel has two base URLs:
 *   - Analytics/query: https://mixpanel.com/api/2.0
 *   - Ingestion/tracking: https://api.mixpanel.com
 *
 * Tools:
 *   mixpanel_track_event     -- Track an event via the ingestion API
 *   mixpanel_query_jql       -- Run a JQL query
 *   mixpanel_get_funnels     -- Get funnel data
 *   mixpanel_get_retention   -- Get retention data
 *   mixpanel_get_segmentation -- Get segmentation / event data
 *   mixpanel_list_cohorts    -- List cohorts
 *   mixpanel_get_engage      -- Query user profiles (Engage)
 *   mixpanel_top_events      -- Get top events
 *   mixpanel_get_insights    -- Get insights report
 *   mixpanel_export_data     -- Export raw event data
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API clients -- two base URLs for Mixpanel
// ---------------------------------------------------------------------------

const { call: analyticsCall, categoriseError } = createApiClient({
  name: 'mixpanel',
  baseUrl: 'https://mixpanel.com/api/2.0',
  tokenEnvVar: 'MIXPANEL_TOKEN',
  authStyle: 'basic',
})

const { call: ingestionCall } = createApiClient({
  name: 'mixpanel-ingestion',
  baseUrl: 'https://api.mixpanel.com',
  tokenEnvVar: 'MIXPANEL_TOKEN',
  authStyle: 'basic',
})

const { call: exportCall } = createApiClient({
  name: 'mixpanel-export',
  baseUrl: 'https://data.mixpanel.com/api/2.0',
  tokenEnvVar: 'MIXPANEL_TOKEN',
  authStyle: 'basic',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'mixpanel-mcp',
  version: '0.1.0',
})

// ---- mixpanel_track_event -------------------------------------------------

server.tool(
  'mixpanel_track_event',
  'Track an event in Mixpanel via the ingestion API. Sends event data with properties for a specific user. Returns the API response (1 = success, 0 = failure).',
  {
    event: z.string().describe('Event name (e.g. "Page View", "Sign Up", "Purchase")'),
    distinct_id: z.string().describe('Unique identifier for the user performing the event'),
    properties: z
      .record(z.unknown())
      .optional()
      .describe('Key-value properties to attach to the event (e.g. { "plan": "premium", "amount": 49.99 })'),
    token: z
      .string()
      .optional()
      .describe('Mixpanel project token (overrides default). Required for ingestion if MIXPANEL_TOKEN is the API secret.'),
    time: z
      .number()
      .int()
      .optional()
      .describe('Unix timestamp (seconds) for when the event occurred (default: now)'),
  },
  async ({ event, distinct_id, properties, token, time }) => {
    try {
      const eventData: Record<string, unknown> = {
        event,
        properties: {
          distinct_id,
          ...properties,
        },
      }
      if (token) (eventData.properties as Record<string, unknown>).token = token
      if (time !== undefined) (eventData.properties as Record<string, unknown>).time = time

      const encoded = Buffer.from(JSON.stringify([eventData])).toString('base64')
      const result = await ingestionCall('/track', {
        method: 'POST',
        body: { data: encoded },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_query_jql ---------------------------------------------------

server.tool(
  'mixpanel_query_jql',
  'Run a JQL (JavaScript Query Language) query against Mixpanel. JQL allows complex analysis of event and people data using JavaScript-like syntax.',
  {
    script: z.string().describe('JQL script to execute (JavaScript-like query language)'),
    params: z
      .record(z.unknown())
      .optional()
      .describe('Optional parameters to pass to the JQL script as the `params` object'),
  },
  async ({ script, params }) => {
    try {
      const body: Record<string, unknown> = { script }
      if (params !== undefined) body.params = JSON.stringify(params)

      const result = await analyticsCall('/jql', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_get_funnels -------------------------------------------------

server.tool(
  'mixpanel_get_funnels',
  'Get funnel conversion data from Mixpanel. Returns step-by-step conversion rates and counts for a defined funnel.',
  {
    funnel_id: z.number().int().describe('The ID of the funnel to retrieve data for'),
    from_date: z.string().describe('Start date in YYYY-MM-DD format'),
    to_date: z.string().describe('End date in YYYY-MM-DD format'),
    length: z
      .number()
      .int()
      .optional()
      .describe('Funnel window length in days (how long a user has to complete the funnel)'),
    interval: z
      .number()
      .int()
      .optional()
      .describe('Number of days per data point for trend data'),
    unit: z
      .enum(['day', 'week', 'month'])
      .optional()
      .describe('Time unit for grouping funnel data'),
  },
  async ({ funnel_id, from_date, to_date, length, interval, unit }) => {
    try {
      const query: Record<string, string | undefined> = {
        funnel_id: String(funnel_id),
        from_date,
        to_date,
      }
      if (length !== undefined) query.length = String(length)
      if (interval !== undefined) query.interval = String(interval)
      if (unit !== undefined) query.unit = unit

      const result = await analyticsCall('/funnels', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_get_retention -----------------------------------------------

server.tool(
  'mixpanel_get_retention',
  'Get retention analysis data from Mixpanel. Shows how many users return after performing an initial action. Returns cohort-based retention rates.',
  {
    from_date: z.string().describe('Start date in YYYY-MM-DD format'),
    to_date: z.string().describe('End date in YYYY-MM-DD format'),
    born_event: z
      .string()
      .optional()
      .describe('The initial event that defines the cohort (default: any event)'),
    event: z
      .string()
      .optional()
      .describe('The return event to measure retention against (default: any event)'),
    retention_type: z
      .enum(['birth', 'compounded'])
      .optional()
      .describe('"birth" for first-time retention, "compounded" for rolling retention'),
    unit: z
      .enum(['day', 'week', 'month'])
      .optional()
      .describe('Time unit for retention buckets'),
    interval_count: z
      .number()
      .int()
      .optional()
      .describe('Number of intervals to include in the retention report'),
  },
  async ({ from_date, to_date, born_event, event, retention_type, unit, interval_count }) => {
    try {
      const query: Record<string, string | undefined> = {
        from_date,
        to_date,
      }
      if (born_event !== undefined) query.born_event = born_event
      if (event !== undefined) query.event = event
      if (retention_type !== undefined) query.retention_type = retention_type
      if (unit !== undefined) query.unit = unit
      if (interval_count !== undefined) query.interval_count = String(interval_count)

      const result = await analyticsCall('/retention', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_get_segmentation --------------------------------------------

server.tool(
  'mixpanel_get_segmentation',
  'Get segmentation (event breakdown) data from Mixpanel. Shows how often an event was performed over time, optionally segmented by a property.',
  {
    event: z.string().describe('The event name to analyse'),
    from_date: z.string().describe('Start date in YYYY-MM-DD format'),
    to_date: z.string().describe('End date in YYYY-MM-DD format'),
    on: z
      .string()
      .optional()
      .describe('Property to segment by (e.g. "properties[\"$browser\"]")'),
    type: z
      .enum(['general', 'unique', 'average'])
      .optional()
      .describe('Analysis type: "general" (total), "unique" (unique users), or "average"'),
    unit: z
      .enum(['minute', 'hour', 'day', 'week', 'month'])
      .optional()
      .describe('Time unit for data points'),
    limit: z
      .number()
      .int()
      .optional()
      .describe('Maximum number of segments to return'),
  },
  async ({ event, from_date, to_date, on, type, unit, limit }) => {
    try {
      const query: Record<string, string | undefined> = {
        event,
        from_date,
        to_date,
      }
      if (on !== undefined) query.on = on
      if (type !== undefined) query.type = type
      if (unit !== undefined) query.unit = unit
      if (limit !== undefined) query.limit = String(limit)

      const result = await analyticsCall('/segmentation', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_list_cohorts ------------------------------------------------

server.tool(
  'mixpanel_list_cohorts',
  'List all cohorts in the Mixpanel project. Returns cohort IDs, names, descriptions, and counts.',
  {},
  async () => {
    try {
      const result = await analyticsCall('/cohorts/list')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_get_engage --------------------------------------------------

server.tool(
  'mixpanel_get_engage',
  'Query user profiles (People/Engage) in Mixpanel. Returns matching user profiles with their properties. Supports filtering with expressions.',
  {
    where: z
      .string()
      .optional()
      .describe('Filter expression for user profiles (e.g. "properties[\"$last_seen\"] > \"2024-01-01\"")'),
    session_id: z
      .string()
      .optional()
      .describe('Session ID for paginating through results (from previous response)'),
    page: z
      .number()
      .int()
      .optional()
      .describe('Page number for pagination (default 0)'),
    output_properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response (omit for all)'),
  },
  async ({ where, session_id, page, output_properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (where !== undefined) query.where = where
      if (session_id !== undefined) query.session_id = session_id
      if (page !== undefined) query.page = String(page)
      if (output_properties !== undefined) {
        query.output_properties = JSON.stringify(output_properties)
      }

      const result = await analyticsCall('/engage', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_top_events --------------------------------------------------

server.tool(
  'mixpanel_top_events',
  'Get the top events in the Mixpanel project by volume. Returns event names ranked by occurrence count.',
  {
    type: z
      .enum(['general', 'unique', 'average'])
      .optional()
      .describe('Count type: "general" (total), "unique" (unique users), or "average"'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of events to return'),
  },
  async ({ type, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (type !== undefined) query.type = type
      if (limit !== undefined) query.limit = String(limit)

      const result = await analyticsCall('/events/top', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_get_insights ------------------------------------------------

server.tool(
  'mixpanel_get_insights',
  'Get an Insights report from Mixpanel. Returns aggregated event data for one or more events over a date range.',
  {
    events: z
      .array(
        z.object({
          event: z.string().describe('Event name'),
          type: z
            .enum(['general', 'unique', 'average'])
            .optional()
            .describe('Count type for this event'),
        }),
      )
      .describe('Array of events to include in the report'),
    from_date: z.string().describe('Start date in YYYY-MM-DD format'),
    to_date: z.string().describe('End date in YYYY-MM-DD format'),
    unit: z
      .enum(['day', 'week', 'month'])
      .optional()
      .describe('Time unit for data points'),
  },
  async ({ events, from_date, to_date, unit }) => {
    try {
      const query: Record<string, string | undefined> = {
        from_date,
        to_date,
      }
      if (unit !== undefined) query.unit = unit

      const result = await analyticsCall('/insights', {
        method: 'POST',
        body: { events },
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- mixpanel_export_data -------------------------------------------------

server.tool(
  'mixpanel_export_data',
  'Export raw event data from Mixpanel. Returns raw events for a date range, optionally filtered by event name. Data is returned as newline-delimited JSON.',
  {
    from_date: z.string().describe('Start date in YYYY-MM-DD format'),
    to_date: z.string().describe('End date in YYYY-MM-DD format'),
    event: z
      .array(z.string())
      .optional()
      .describe('Array of event names to export (omit for all events)'),
    limit: z
      .number()
      .int()
      .optional()
      .describe('Maximum number of events to return'),
  },
  async ({ from_date, to_date, event, limit }) => {
    try {
      const query: Record<string, string | undefined> = {
        from_date,
        to_date,
      }
      if (event !== undefined) query.event = JSON.stringify(event)
      if (limit !== undefined) query.limit = String(limit)

      const result = await exportCall('/export', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
