/**
 * Datadog MCP Server -- Production-ready
 *
 * Provides tools to interact with the Datadog REST API on behalf of the
 * authenticated user.  Credentials are injected via the DATADOG_API_KEY
 * and DATADOG_APP_KEY environment variables (set by the MCPGate gateway).
 *
 * Datadog uses two API keys: DD-API-KEY and DD-APPLICATION-KEY headers.
 *
 * Tools:
 *   datadog_list_monitors     -- List monitors
 *   datadog_get_monitor       -- Get a single monitor
 *   datadog_create_monitor    -- Create a monitor
 *   datadog_list_dashboards   -- List dashboards
 *   datadog_get_dashboard     -- Get a single dashboard
 *   datadog_query_metrics     -- Query timeseries metrics
 *   datadog_list_events       -- List events
 *   datadog_create_event      -- Create an event
 *   datadog_list_hosts        -- List infrastructure hosts
 *   datadog_search_logs       -- Search logs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'datadog',
  baseUrl: 'https://api.datadoghq.com/api',
  tokenEnvVar: 'DATADOG_API_KEY',
  authStyle: 'custom-header',
  authHeader: 'DD-API-KEY',
  defaultHeaders: {
    'DD-APPLICATION-KEY': process.env.DATADOG_APP_KEY || '',
  },
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'datadog-mcp',
  version: '0.1.0',
})

// ---- datadog_list_monitors ------------------------------------------------

server.tool(
  'datadog_list_monitors',
  'List Datadog monitors. Can be filtered by name, tags, or type.',
  {
    name: z.string().optional().describe('Filter monitors by name (partial match)'),
    tags: z
      .string()
      .optional()
      .describe('Comma-separated list of tags to filter by (e.g. "env:prod,service:web")'),
    monitor_tags: z
      .string()
      .optional()
      .describe('Comma-separated list of monitor tags to filter by'),
    page: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number for pagination (default 0)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of monitors per page (1-1000, default 100)'),
  },
  async ({ name, tags, monitor_tags, page, page_size }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (name !== undefined) query.name = name
      if (tags !== undefined) query.tags = tags
      if (monitor_tags !== undefined) query.monitor_tags = monitor_tags
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)

      const result = await call('/v1/monitor', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_get_monitor --------------------------------------------------

server.tool(
  'datadog_get_monitor',
  'Get details of a single Datadog monitor by ID. Returns monitor configuration, status, and history.',
  {
    monitor_id: z.number().int().describe('The Datadog monitor ID'),
    group_states: z
      .string()
      .optional()
      .describe('Comma-separated group states to return (e.g. "all", "alert,warn,no data")'),
  },
  async ({ monitor_id, group_states }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (group_states !== undefined) query.group_states = group_states

      const result = await call(`/v1/monitor/${monitor_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_create_monitor -----------------------------------------------

server.tool(
  'datadog_create_monitor',
  'Create a new Datadog monitor. Returns the created monitor object with its ID.',
  {
    name: z.string().describe('Monitor name'),
    type: z
      .enum([
        'composite', 'event alert', 'log alert', 'metric alert',
        'process alert', 'query alert', 'rum alert', 'service check',
        'synthetics alert', 'trace-analytics alert', 'slo alert',
        'event-v2 alert', 'audit alert', 'ci-pipelines alert',
        'ci-tests alert', 'error-tracking alert',
      ])
      .describe('Monitor type'),
    query: z.string().describe('Monitor query string (syntax depends on monitor type)'),
    message: z
      .string()
      .optional()
      .describe('Notification message body. Supports Datadog @-mention syntax for notifications.'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tags to apply to the monitor (e.g. ["env:prod", "team:backend"])'),
    priority: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Monitor priority (1-5, where 1 is highest)'),
    options: z
      .record(z.unknown())
      .optional()
      .describe('Additional monitor options (thresholds, notify_no_data, etc.)'),
  },
  async ({ name, type, query, message, tags, priority, options }) => {
    try {
      const body: Record<string, unknown> = { name, type, query }
      if (message !== undefined) body.message = message
      if (tags !== undefined) body.tags = tags
      if (priority !== undefined) body.priority = priority
      if (options !== undefined) body.options = options

      const result = await call('/v1/monitor', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_list_dashboards ----------------------------------------------

server.tool(
  'datadog_list_dashboards',
  'List Datadog dashboards. Returns dashboard summaries with IDs, titles, and URLs.',
  {
    filter_shared: z
      .boolean()
      .optional()
      .describe('If true, only return shared dashboards'),
    filter_deleted: z
      .boolean()
      .optional()
      .describe('If true, include deleted dashboards'),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of dashboards to return (default 100)'),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
  },
  async ({ filter_shared, filter_deleted, count, start }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter_shared !== undefined) query.filter_shared = String(filter_shared)
      if (filter_deleted !== undefined) query.filter_deleted = String(filter_deleted)
      if (count !== undefined) query.count = String(count)
      if (start !== undefined) query.start = String(start)

      const result = await call('/v1/dashboard', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_get_dashboard ------------------------------------------------

server.tool(
  'datadog_get_dashboard',
  'Get details of a single Datadog dashboard by ID. Returns full dashboard definition including widgets.',
  {
    dashboard_id: z.string().describe('The Datadog dashboard ID'),
  },
  async ({ dashboard_id }) => {
    try {
      const result = await call(`/v1/dashboard/${encodeURIComponent(dashboard_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_query_metrics ------------------------------------------------

server.tool(
  'datadog_query_metrics',
  'Query timeseries metric data from Datadog. Returns metric points for a given time range.',
  {
    from: z
      .number()
      .describe('Start of the query time range as a Unix timestamp (seconds)'),
    to: z
      .number()
      .describe('End of the query time range as a Unix timestamp (seconds)'),
    query: z
      .string()
      .describe('Datadog metrics query string (e.g. "avg:system.cpu.user{host:myhost}")'),
  },
  async ({ from, to, query }) => {
    try {
      const q: Record<string, string | undefined> = {
        from: String(from),
        to: String(to),
        query,
      }

      const result = await call('/v1/query', { query: q })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_list_events --------------------------------------------------

server.tool(
  'datadog_list_events',
  'List events from the Datadog event stream. Requires a time range.',
  {
    start: z
      .number()
      .describe('Start of the time range as a Unix timestamp (seconds)'),
    end: z
      .number()
      .describe('End of the time range as a Unix timestamp (seconds)'),
    priority: z
      .enum(['normal', 'low'])
      .optional()
      .describe('Filter by event priority'),
    sources: z
      .string()
      .optional()
      .describe('Comma-separated list of sources to filter by'),
    tags: z
      .string()
      .optional()
      .describe('Comma-separated list of tags to filter by'),
    unaggregated: z
      .boolean()
      .optional()
      .describe('If true, return unaggregated events'),
  },
  async ({ start, end, priority, sources, tags, unaggregated }) => {
    try {
      const query: Record<string, string | undefined> = {
        start: String(start),
        end: String(end),
      }
      if (priority !== undefined) query.priority = priority
      if (sources !== undefined) query.sources = sources
      if (tags !== undefined) query.tags = tags
      if (unaggregated !== undefined) query.unaggregated = String(unaggregated)

      const result = await call('/v1/events', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_create_event -------------------------------------------------

server.tool(
  'datadog_create_event',
  'Post an event to the Datadog event stream. Returns the created event.',
  {
    title: z.string().describe('Event title'),
    text: z.string().describe('Event body text. Supports Datadog markdown.'),
    date_happened: z
      .number()
      .optional()
      .describe('Unix timestamp (seconds) when the event occurred. Defaults to now.'),
    priority: z
      .enum(['normal', 'low'])
      .optional()
      .describe('Event priority (default: normal)'),
    alert_type: z
      .enum(['error', 'warning', 'info', 'success', 'user_update', 'recommendation', 'snapshot'])
      .optional()
      .describe('Alert type for the event'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of tags for the event (e.g. ["env:prod", "service:api"])'),
    source_type_name: z
      .string()
      .optional()
      .describe('Source type name (e.g. "nagios", "hudson", "jenkins")'),
  },
  async ({ title, text, date_happened, priority, alert_type, tags, source_type_name }) => {
    try {
      const body: Record<string, unknown> = { title, text }
      if (date_happened !== undefined) body.date_happened = date_happened
      if (priority !== undefined) body.priority = priority
      if (alert_type !== undefined) body.alert_type = alert_type
      if (tags !== undefined) body.tags = tags
      if (source_type_name !== undefined) body.source_type_name = source_type_name

      const result = await call('/v1/events', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_list_hosts ---------------------------------------------------

server.tool(
  'datadog_list_hosts',
  'List infrastructure hosts reporting to Datadog. Can filter by name or tags.',
  {
    filter: z
      .string()
      .optional()
      .describe('Search query to filter hosts (matches hostname, aliases, tags)'),
    sort_field: z
      .string()
      .optional()
      .describe('Field to sort by (e.g. "cpu", "iowait", "apps")'),
    sort_dir: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction'),
    start: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Offset for pagination (default 0)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of hosts to return (default 100)'),
    from: z
      .number()
      .optional()
      .describe('Only return hosts that have reported in the last N seconds'),
    include_muted_hosts_data: z
      .boolean()
      .optional()
      .describe('Include muted host information'),
    include_hosts_metadata: z
      .boolean()
      .optional()
      .describe('Include host metadata (gohai, platform, etc.)'),
  },
  async ({ filter, sort_field, sort_dir, start, count, from, include_muted_hosts_data, include_hosts_metadata }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter !== undefined) query.filter = filter
      if (sort_field !== undefined) query.sort_field = sort_field
      if (sort_dir !== undefined) query.sort_dir = sort_dir
      if (start !== undefined) query.start = String(start)
      if (count !== undefined) query.count = String(count)
      if (from !== undefined) query.from = String(from)
      if (include_muted_hosts_data !== undefined) query.include_muted_hosts_data = String(include_muted_hosts_data)
      if (include_hosts_metadata !== undefined) query.include_hosts_metadata = String(include_hosts_metadata)

      const result = await call('/v1/hosts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- datadog_search_logs --------------------------------------------------

server.tool(
  'datadog_search_logs',
  'Search and filter Datadog logs. Uses the v2 logs search API with a query string and time range.',
  {
    query: z.string().describe('Datadog log search query (e.g. "service:web status:error")'),
    from: z
      .string()
      .optional()
      .describe('Start of time range in ISO 8601 format (e.g. "2024-01-01T00:00:00Z")'),
    to: z
      .string()
      .optional()
      .describe('End of time range in ISO 8601 format'),
    sort: z
      .enum(['timestamp', '-timestamp'])
      .optional()
      .describe('Sort order: "timestamp" for ascending, "-timestamp" for descending (default)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of log entries to return (1-1000, default 10)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  },
  async ({ query, from, to, sort, limit, cursor }) => {
    try {
      const body: Record<string, unknown> = {
        filter: {
          query,
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {}),
        },
      }
      if (sort !== undefined) body.sort = sort
      if (limit !== undefined) {
        body.page = { ...(typeof body.page === 'object' ? body.page as Record<string, unknown> : {}), limit }
      }
      if (cursor !== undefined) {
        body.page = { ...(typeof body.page === 'object' ? body.page as Record<string, unknown> : {}), cursor }
      }

      const result = await call('/v2/logs/events/search', {
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
