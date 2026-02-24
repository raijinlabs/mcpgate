/**
 * Sentry MCP Server -- Production-ready
 *
 * Provides tools to interact with the Sentry REST API on behalf of the
 * authenticated user.  Credentials are injected via the SENTRY_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Sentry uses cursor-based pagination.  Most list endpoints return a `Link`
 * header with cursor values.  This server exposes a `cursor` parameter on
 * paginated tools for easy navigation.
 *
 * Tools:
 *   sentry_list_issues        -- List issues for a project
 *   sentry_get_issue          -- Get issue details
 *   sentry_update_issue       -- Update an issue (status, assignee, etc.)
 *   sentry_list_events        -- List events for an issue
 *   sentry_get_event          -- Get event details
 *   sentry_list_projects      -- List projects for an organisation
 *   sentry_get_project        -- Get project details
 *   sentry_list_releases      -- List releases for an organisation
 *   sentry_create_release     -- Create a new release
 *   sentry_resolve_issue      -- Resolve an issue (shortcut for update)
 *   sentry_list_organizations -- List accessible organisations
 *   sentry_search_issues      -- Search issues with Sentry query syntax
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'sentry',
  baseUrl: 'https://sentry.io/api/0',
  tokenEnvVar: 'SENTRY_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: { Accept: 'application/json' },
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'sentry-mcp',
  version: '0.1.0',
})

// ---- sentry_list_issues ---------------------------------------------------

server.tool(
  'sentry_list_issues',
  'List issues for a Sentry project. Results are paginated using cursor-based pagination.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    project_slug: z.string().describe('Project slug (e.g. "my-project")'),
    query: z
      .string()
      .optional()
      .describe('Sentry search query (e.g. "is:unresolved", "assigned:me", "level:error")'),
    sort: z
      .enum(['date', 'new', 'priority', 'freq', 'user'])
      .optional()
      .describe('Sort order for issues (default: date)'),
    statsPeriod: z
      .string()
      .optional()
      .describe('Stats period for event counts (e.g. "24h", "14d")'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ organization_slug, project_slug, query, sort, statsPeriod, cursor }) => {
    try {
      const q: Record<string, string | undefined> = {
        project: project_slug,
      }
      if (query !== undefined) q.query = query
      if (sort !== undefined) q.sort = sort
      if (statsPeriod !== undefined) q.statsPeriod = statsPeriod
      if (cursor !== undefined) q.cursor = cursor

      const result = await call(
        `/projects/${encodeURIComponent(organization_slug)}/${encodeURIComponent(project_slug)}/issues/`,
        { query: q },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_get_issue -----------------------------------------------------

server.tool(
  'sentry_get_issue',
  'Retrieve detailed information about a Sentry issue including event count, first/last seen, and tags.',
  {
    issue_id: z.string().describe('Sentry issue ID (numeric string)'),
  },
  async ({ issue_id }) => {
    try {
      const result = await call(`/issues/${encodeURIComponent(issue_id)}/`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_update_issue --------------------------------------------------

server.tool(
  'sentry_update_issue',
  'Update a Sentry issue. Can change status, assignee, and other properties. Returns the updated issue.',
  {
    issue_id: z.string().describe('Sentry issue ID (numeric string)'),
    status: z
      .enum(['resolved', 'unresolved', 'ignored'])
      .optional()
      .describe('New issue status'),
    assignedTo: z
      .string()
      .optional()
      .describe('Assign to a user (email or username) or team (team:slug). Empty string to unassign.'),
    hasSeen: z.boolean().optional().describe('Mark the issue as seen/unseen'),
    isBookmarked: z.boolean().optional().describe('Bookmark or unbookmark the issue'),
    isSubscribed: z.boolean().optional().describe('Subscribe or unsubscribe from the issue'),
    isPublic: z.boolean().optional().describe('Make the issue public or private'),
  },
  async ({ issue_id, status, assignedTo, hasSeen, isBookmarked, isSubscribed, isPublic }) => {
    try {
      const body: Record<string, unknown> = {}
      if (status !== undefined) body.status = status
      if (assignedTo !== undefined) body.assignedTo = assignedTo
      if (hasSeen !== undefined) body.hasSeen = hasSeen
      if (isBookmarked !== undefined) body.isBookmarked = isBookmarked
      if (isSubscribed !== undefined) body.isSubscribed = isSubscribed
      if (isPublic !== undefined) body.isPublic = isPublic

      const result = await call(`/issues/${encodeURIComponent(issue_id)}/`, {
        method: 'PUT',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_list_events ---------------------------------------------------

server.tool(
  'sentry_list_events',
  'List events for a Sentry issue. Returns individual error/event occurrences. Results are paginated.',
  {
    issue_id: z.string().describe('Sentry issue ID (numeric string)'),
    full: z
      .boolean()
      .optional()
      .describe('If true, return the full event body (default: false)'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ issue_id, full, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (full !== undefined) query.full = String(full)
      if (cursor !== undefined) query.cursor = cursor

      const result = await call(`/issues/${encodeURIComponent(issue_id)}/events/`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_get_event -----------------------------------------------------

server.tool(
  'sentry_get_event',
  'Retrieve detailed information about a specific Sentry event including stack traces, breadcrumbs, and context.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    project_slug: z.string().describe('Project slug (e.g. "my-project")'),
    event_id: z.string().describe('Event ID (UUID string)'),
  },
  async ({ organization_slug, project_slug, event_id }) => {
    try {
      const result = await call(
        `/projects/${encodeURIComponent(organization_slug)}/${encodeURIComponent(project_slug)}/events/${encodeURIComponent(event_id)}/`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_list_projects -------------------------------------------------

server.tool(
  'sentry_list_projects',
  'List projects for a Sentry organisation. Results are paginated.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ organization_slug, cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (cursor !== undefined) query.cursor = cursor

      const result = await call(
        `/organizations/${encodeURIComponent(organization_slug)}/projects/`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_get_project ---------------------------------------------------

server.tool(
  'sentry_get_project',
  'Get detailed information about a Sentry project including team, platform, and configuration.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    project_slug: z.string().describe('Project slug (e.g. "my-project")'),
  },
  async ({ organization_slug, project_slug }) => {
    try {
      const result = await call(
        `/projects/${encodeURIComponent(organization_slug)}/${encodeURIComponent(project_slug)}/`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_list_releases -------------------------------------------------

server.tool(
  'sentry_list_releases',
  'List releases for a Sentry organisation. Results are paginated.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    project_slug: z
      .string()
      .optional()
      .describe('Filter releases by project slug'),
    query: z
      .string()
      .optional()
      .describe('Search releases by version string'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ organization_slug, project_slug, query, cursor }) => {
    try {
      const q: Record<string, string | undefined> = {}
      if (project_slug !== undefined) q.project = project_slug
      if (query !== undefined) q.query = query
      if (cursor !== undefined) q.cursor = cursor

      const result = await call(
        `/organizations/${encodeURIComponent(organization_slug)}/releases/`,
        { query: q },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_create_release ------------------------------------------------

server.tool(
  'sentry_create_release',
  'Create a new release in Sentry. Returns the created release object.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    version: z.string().describe('Unique version identifier for the release (e.g. "1.0.0", commit SHA)'),
    projects: z
      .array(z.string())
      .describe('Array of project slugs to associate this release with'),
    ref: z.string().optional().describe('Git ref (commit SHA) for this release'),
    url: z.string().optional().describe('URL for the release (e.g. changelog, CI build)'),
    dateReleased: z
      .string()
      .optional()
      .describe('Release date in ISO 8601 format (defaults to now)'),
  },
  async ({ organization_slug, version, projects, ref, url, dateReleased }) => {
    try {
      const body: Record<string, unknown> = { version, projects }
      if (ref !== undefined) body.ref = ref
      if (url !== undefined) body.url = url
      if (dateReleased !== undefined) body.dateReleased = dateReleased

      const result = await call(
        `/organizations/${encodeURIComponent(organization_slug)}/releases/`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_resolve_issue -------------------------------------------------

server.tool(
  'sentry_resolve_issue',
  'Resolve a Sentry issue. This is a convenience shortcut that sets the issue status to "resolved". Returns the updated issue.',
  {
    issue_id: z.string().describe('Sentry issue ID (numeric string)'),
  },
  async ({ issue_id }) => {
    try {
      const result = await call(`/issues/${encodeURIComponent(issue_id)}/`, {
        method: 'PUT',
        body: { status: 'resolved' },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_list_organizations --------------------------------------------

server.tool(
  'sentry_list_organizations',
  'List Sentry organisations accessible by the authenticated user. Results are paginated.',
  {
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ cursor }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (cursor !== undefined) query.cursor = cursor

      const result = await call('/organizations/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sentry_search_issues -------------------------------------------------

server.tool(
  'sentry_search_issues',
  'Search for issues across Sentry using the powerful query syntax. Supports filters like is:unresolved, assigned:me, level:error, browser:Chrome, and free-text search.',
  {
    organization_slug: z.string().describe('Organisation slug (e.g. "my-org")'),
    query: z
      .string()
      .describe('Sentry search query (e.g. "is:unresolved TypeError", "assigned:me level:error")'),
    project: z
      .array(z.string())
      .optional()
      .describe('Array of project slugs to search within (omit for all projects)'),
    sort: z
      .enum(['date', 'new', 'priority', 'freq', 'user'])
      .optional()
      .describe('Sort order for results (default: date)'),
    statsPeriod: z
      .string()
      .optional()
      .describe('Stats period for event counts (e.g. "24h", "14d")'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ organization_slug, query: searchQuery, project, sort, statsPeriod, cursor }) => {
    try {
      const q: Record<string, string | undefined> = {
        query: searchQuery,
      }
      if (sort !== undefined) q.sort = sort
      if (statsPeriod !== undefined) q.statsPeriod = statsPeriod
      if (cursor !== undefined) q.cursor = cursor
      // Sentry accepts multiple project params -- use the first for the query
      // param approach; for multiple projects use the project parameter array
      if (project !== undefined && project.length > 0) {
        q.project = project.join('&project=')
      }

      const result = await call(
        `/organizations/${encodeURIComponent(organization_slug)}/issues/`,
        { query: q },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
