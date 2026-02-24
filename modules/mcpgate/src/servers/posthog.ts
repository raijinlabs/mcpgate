/**
 * PostHog MCP Server -- Production-ready
 *
 * Provides tools to interact with the PostHog API on behalf of the
 * authenticated project.  Credentials are injected via the POSTHOG_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * The base URL defaults to the PostHog cloud but can be overridden via
 * POSTHOG_HOST for self-hosted instances.
 *
 * Tools:
 *   posthog_capture_event     -- Capture an event
 *   posthog_list_events       -- List events in a project
 *   posthog_list_persons      -- List persons in a project
 *   posthog_get_person        -- Get a single person
 *   posthog_list_feature_flags -- List feature flags
 *   posthog_get_feature_flag  -- Get a single feature flag
 *   posthog_list_insights     -- List saved insights
 *   posthog_get_insight       -- Get a single insight
 *   posthog_list_dashboards   -- List dashboards
 *   posthog_query             -- Run a HogQL query
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client -- dynamic host from POSTHOG_HOST env
// ---------------------------------------------------------------------------

const posthogHost = process.env.POSTHOG_HOST || 'https://app.posthog.com'
const baseUrl = `${posthogHost}/api`

const { call, categoriseError } = createApiClient({
  name: 'posthog',
  baseUrl,
  tokenEnvVar: 'POSTHOG_TOKEN',
  authStyle: 'bearer',
})

// Capture endpoint uses a different auth mechanism (api_key in body)
const { call: captureCall } = createApiClient({
  name: 'posthog-capture',
  baseUrl: posthogHost,
  tokenEnvVar: 'POSTHOG_TOKEN',
  authStyle: 'none',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'posthog-mcp',
  version: '0.1.0',
})

// ---- posthog_capture_event ------------------------------------------------

server.tool(
  'posthog_capture_event',
  'Capture an event in PostHog. Sends event data with properties for a specific user. The api_key must be provided (this is the PostHog project API key, not the personal API token).',
  {
    api_key: z.string().describe('PostHog project API key (public key used for ingestion)'),
    distinct_id: z.string().describe('Unique identifier for the user performing the event'),
    event: z.string().describe('Event name (e.g. "page_view", "sign_up", "purchase")'),
    properties: z
      .record(z.unknown())
      .optional()
      .describe('Key-value properties to attach to the event'),
    timestamp: z
      .string()
      .optional()
      .describe('ISO 8601 timestamp for when the event occurred (default: now)'),
  },
  async ({ api_key, distinct_id, event, properties, timestamp }) => {
    try {
      const body: Record<string, unknown> = {
        api_key,
        distinct_id,
        event,
      }
      if (properties !== undefined) body.properties = properties
      if (timestamp !== undefined) body.timestamp = timestamp

      const result = await captureCall('/capture/', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_list_events --------------------------------------------------

server.tool(
  'posthog_list_events',
  'List events in a PostHog project. Returns event data including event names, timestamps, properties, and associated persons. Results are paginated.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    event: z
      .string()
      .optional()
      .describe('Filter by event name'),
    person_id: z
      .string()
      .optional()
      .describe('Filter events by person ID'),
    after: z
      .string()
      .optional()
      .describe('Only return events after this ISO 8601 timestamp'),
    before: z
      .string()
      .optional()
      .describe('Only return events before this ISO 8601 timestamp'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of events to return (1-100, default 100)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of events to skip for pagination'),
  },
  async ({ project_id, event, person_id, after, before, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (event !== undefined) query.event = event
      if (person_id !== undefined) query.person_id = person_id
      if (after !== undefined) query.after = after
      if (before !== undefined) query.before = before
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      const result = await call(`/projects/${project_id}/events`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_list_persons -------------------------------------------------

server.tool(
  'posthog_list_persons',
  'List persons (users) in a PostHog project. Returns person details including distinct IDs and properties. Results are paginated.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter persons by email, name, or distinct ID'),
    properties: z
      .string()
      .optional()
      .describe('JSON-encoded array of property filters (e.g. [{"key":"email","value":"@company.com","type":"person","operator":"icontains"}])'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of persons to return (1-100)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of persons to skip for pagination'),
  },
  async ({ project_id, search, properties, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (properties !== undefined) query.properties = properties
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      const result = await call(`/projects/${project_id}/persons`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_get_person ---------------------------------------------------

server.tool(
  'posthog_get_person',
  'Retrieve a single person by their PostHog ID. Returns the person\'s distinct IDs, properties, and metadata.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    person_id: z.string().describe('The PostHog person ID (UUID)'),
  },
  async ({ project_id, person_id }) => {
    try {
      const result = await call(`/projects/${project_id}/persons/${person_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_list_feature_flags -------------------------------------------

server.tool(
  'posthog_list_feature_flags',
  'List feature flags in a PostHog project. Returns flag keys, names, rollout percentages, and filter conditions.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter feature flags by key or name'),
    active: z
      .boolean()
      .optional()
      .describe('Filter by active status (true = active only)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of feature flags to return (1-100)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of feature flags to skip for pagination'),
  },
  async ({ project_id, search, active, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (active !== undefined) query.active = String(active)
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      const result = await call(`/projects/${project_id}/feature_flags`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_get_feature_flag ---------------------------------------------

server.tool(
  'posthog_get_feature_flag',
  'Retrieve a single feature flag by its ID. Returns the full flag configuration including key, filters, rollout percentage, and groups.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    flag_id: z.string().describe('The feature flag ID (integer)'),
  },
  async ({ project_id, flag_id }) => {
    try {
      const result = await call(`/projects/${project_id}/feature_flags/${flag_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_list_insights ------------------------------------------------

server.tool(
  'posthog_list_insights',
  'List saved insights in a PostHog project. Returns insight names, types, filters, and results. Results are paginated.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter insights by name'),
    insight: z
      .enum(['TRENDS', 'FUNNELS', 'RETENTION', 'PATHS', 'LIFECYCLE', 'STICKINESS'])
      .optional()
      .describe('Filter by insight type'),
    saved: z
      .boolean()
      .optional()
      .describe('Filter for saved insights only'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of insights to return (1-100)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of insights to skip for pagination'),
  },
  async ({ project_id, search, insight, saved, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (insight !== undefined) query.insight = insight
      if (saved !== undefined) query.saved = String(saved)
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      const result = await call(`/projects/${project_id}/insights`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_get_insight --------------------------------------------------

server.tool(
  'posthog_get_insight',
  'Retrieve a single saved insight by its ID. Returns the full insight configuration and cached results.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    insight_id: z.string().describe('The insight ID (integer)'),
  },
  async ({ project_id, insight_id }) => {
    try {
      const result = await call(`/projects/${project_id}/insights/${insight_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_list_dashboards ----------------------------------------------

server.tool(
  'posthog_list_dashboards',
  'List dashboards in a PostHog project. Returns dashboard names, descriptions, and the insights they contain.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter dashboards by name'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of dashboards to return (1-100)'),
    offset: z
      .number()
      .int()
      .optional()
      .describe('Number of dashboards to skip for pagination'),
  },
  async ({ project_id, search, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = String(offset)

      const result = await call(`/projects/${project_id}/dashboards`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- posthog_query --------------------------------------------------------

server.tool(
  'posthog_query',
  'Run a HogQL query against a PostHog project. HogQL is PostHog\'s SQL-like query language for analysing events and persons data. Returns query results as rows.',
  {
    project_id: z.string().describe('The PostHog project ID'),
    query: z.string().describe('HogQL query string (e.g. "SELECT event, count() FROM events GROUP BY event ORDER BY count() DESC LIMIT 10")'),
  },
  async ({ project_id, query: hogqlQuery }) => {
    try {
      const result = await call(`/projects/${project_id}/query`, {
        method: 'POST',
        body: {
          query: {
            kind: 'HogQLQuery',
            query: hogqlQuery,
          },
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
