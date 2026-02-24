/**
 * Jira MCP Server -- Production-ready
 *
 * Provides tools to interact with the Jira REST API (v3) and Agile API on
 * behalf of the authenticated user.  Credentials are injected via the
 * JIRA_TOKEN and JIRA_INSTANCE_URL environment variables (set by the
 * MCPGate gateway).
 *
 * The base URL is dynamic per-tenant (e.g. https://mycompany.atlassian.net).
 *
 * Tools:
 *   jira_create_issue    -- Create a new issue
 *   jira_get_issue       -- Get issue details by key or ID
 *   jira_update_issue    -- Update an existing issue
 *   jira_search_issues   -- Search issues using JQL
 *   jira_add_comment     -- Add a comment to an issue
 *   jira_list_comments   -- List comments on an issue
 *   jira_transition_issue -- Transition an issue to a new status
 *   jira_assign_issue    -- Assign an issue to a user
 *   jira_list_projects   -- List accessible projects
 *   jira_get_project     -- Get project details
 *   jira_list_sprints    -- List sprints for a board (Agile API)
 *   jira_add_to_sprint   -- Move issues to a sprint (Agile API)
 *   jira_list_boards     -- List agile boards (Agile API)
 *   jira_create_sprint   -- Create a new sprint (Agile API)
 *   jira_list_statuses   -- List available statuses
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API clients
// ---------------------------------------------------------------------------

function getInstanceUrl(): string {
  const url = process.env.JIRA_INSTANCE_URL || ''
  if (!url) {
    throw new Error(
      'JIRA_INSTANCE_URL not configured. Set it to your Atlassian instance URL (e.g. https://mycompany.atlassian.net).',
    )
  }
  // Remove trailing slash if present
  return url.replace(/\/+$/, '')
}

// REST API v3 client
const { call, categoriseError } = createApiClient({
  name: 'jira',
  baseUrl: `${process.env.JIRA_INSTANCE_URL || 'https://placeholder.atlassian.net'}/rest/api/3`,
  tokenEnvVar: 'JIRA_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: { Accept: 'application/json' },
})

// Agile API client
const { call: agileCall } = createApiClient({
  name: 'jira-agile',
  baseUrl: `${process.env.JIRA_INSTANCE_URL || 'https://placeholder.atlassian.net'}/rest/agile/1.0`,
  tokenEnvVar: 'JIRA_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: { Accept: 'application/json' },
})

/**
 * Wrapper that builds the correct URL at call-time from JIRA_INSTANCE_URL.
 * This ensures the dynamic env var is read when the tool is actually invoked,
 * not when the module is imported.
 */
async function jiraApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const base = getInstanceUrl()
  const { call: liveCall } = createApiClient({
    name: 'jira',
    baseUrl: `${base}/rest/api/3`,
    tokenEnvVar: 'JIRA_TOKEN',
    authStyle: 'bearer',
    defaultHeaders: { Accept: 'application/json' },
  })
  return liveCall(path, opts)
}

async function jiraAgileApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const base = getInstanceUrl()
  const { call: liveCall } = createApiClient({
    name: 'jira-agile',
    baseUrl: `${base}/rest/agile/1.0`,
    tokenEnvVar: 'JIRA_TOKEN',
    authStyle: 'bearer',
    defaultHeaders: { Accept: 'application/json' },
  })
  return liveCall(path, opts)
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'jira-mcp',
  version: '0.1.0',
})

// ---- jira_create_issue ----------------------------------------------------

server.tool(
  'jira_create_issue',
  'Create a new Jira issue. Returns the created issue including its key and self URL.',
  {
    projectKey: z.string().describe('Project key (e.g. "PROJ")'),
    summary: z.string().describe('Issue summary / title'),
    issueType: z.string().describe('Issue type name (e.g. "Task", "Bug", "Story")'),
    description: z
      .string()
      .optional()
      .describe('Issue description in plain text (converted to ADF paragraph)'),
    assigneeAccountId: z
      .string()
      .optional()
      .describe('Atlassian account ID of the assignee'),
    priority: z
      .string()
      .optional()
      .describe('Priority name (e.g. "High", "Medium", "Low")'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Array of label strings to apply'),
    parentKey: z
      .string()
      .optional()
      .describe('Parent issue key for sub-tasks (e.g. "PROJ-100")'),
  },
  async ({ projectKey, summary, issueType, description, assigneeAccountId, priority, labels, parentKey }) => {
    try {
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      }
      if (description !== undefined) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        }
      }
      if (assigneeAccountId !== undefined) {
        fields.assignee = { accountId: assigneeAccountId }
      }
      if (priority !== undefined) {
        fields.priority = { name: priority }
      }
      if (labels !== undefined) {
        fields.labels = labels
      }
      if (parentKey !== undefined) {
        fields.parent = { key: parentKey }
      }

      const result = await jiraApi('/issue', {
        method: 'POST',
        body: { fields },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_get_issue -------------------------------------------------------

server.tool(
  'jira_get_issue',
  'Retrieve a Jira issue by key or ID. Returns full issue details including fields, status, and changelog.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of field names to include (default: all navigable fields)'),
    expand: z
      .string()
      .optional()
      .describe('Comma-separated list of expansions (e.g. "changelog,transitions")'),
  },
  async ({ issueIdOrKey, fields, expand }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields
      if (expand !== undefined) query.expand = expand

      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_update_issue ----------------------------------------------------

server.tool(
  'jira_update_issue',
  'Update an existing Jira issue. Only provided fields are modified. Returns 204 on success.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    summary: z.string().optional().describe('New issue summary'),
    description: z
      .string()
      .optional()
      .describe('New description in plain text (converted to ADF paragraph)'),
    assigneeAccountId: z
      .string()
      .optional()
      .describe('New assignee Atlassian account ID'),
    priority: z
      .string()
      .optional()
      .describe('New priority name (e.g. "High")'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Replace all labels with these'),
  },
  async ({ issueIdOrKey, summary, description, assigneeAccountId, priority, labels }) => {
    try {
      const fields: Record<string, unknown> = {}
      if (summary !== undefined) fields.summary = summary
      if (description !== undefined) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        }
      }
      if (assigneeAccountId !== undefined) {
        fields.assignee = { accountId: assigneeAccountId }
      }
      if (priority !== undefined) {
        fields.priority = { name: priority }
      }
      if (labels !== undefined) {
        fields.labels = labels
      }

      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}`, {
        method: 'PUT',
        body: { fields },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_search_issues ---------------------------------------------------

server.tool(
  'jira_search_issues',
  'Search for Jira issues using JQL (Jira Query Language). Results are paginated. Uses POST to allow large queries.',
  {
    jql: z.string().describe('JQL query string (e.g. "project = PROJ AND status = Open")'),
    fields: z
      .array(z.string())
      .optional()
      .describe('Array of field names to include in results (default: summary, status, assignee)'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results (1-100, default 50)'),
    startAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Index of the first result to return (for pagination, default 0)'),
  },
  async ({ jql, fields, maxResults, startAt }) => {
    try {
      const body: Record<string, unknown> = { jql }
      if (fields !== undefined) body.fields = fields
      if (maxResults !== undefined) body.maxResults = maxResults
      if (startAt !== undefined) body.startAt = startAt

      const result = await jiraApi('/search', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_add_comment -----------------------------------------------------

server.tool(
  'jira_add_comment',
  'Add a comment to a Jira issue. Returns the created comment.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    body: z.string().describe('Comment body in plain text (converted to ADF)'),
  },
  async ({ issueIdOrKey, body }) => {
    try {
      const adfBody = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      }
      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}/comment`, {
        method: 'POST',
        body: { body: adfBody },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_list_comments ---------------------------------------------------

server.tool(
  'jira_list_comments',
  'List comments on a Jira issue. Results are paginated.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    startAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Index of the first comment to return (default 0)'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of comments (1-100, default 50)'),
  },
  async ({ issueIdOrKey, startAt, maxResults }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (startAt !== undefined) query.startAt = String(startAt)
      if (maxResults !== undefined) query.maxResults = String(maxResults)

      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}/comment`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_transition_issue ------------------------------------------------

server.tool(
  'jira_transition_issue',
  'Transition a Jira issue to a new status. First use jira_get_issue with expand="transitions" to discover available transition IDs.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    transitionId: z.string().describe('The ID of the transition to perform (get from issue transitions)'),
    comment: z
      .string()
      .optional()
      .describe('Optional comment to add with the transition'),
  },
  async ({ issueIdOrKey, transitionId, comment }) => {
    try {
      const body: Record<string, unknown> = {
        transition: { id: transitionId },
      }
      if (comment !== undefined) {
        body.update = {
          comment: [
            {
              add: {
                body: {
                  type: 'doc',
                  version: 1,
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: comment }],
                    },
                  ],
                },
              },
            },
          ],
        }
      }

      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}/transitions`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_assign_issue ----------------------------------------------------

server.tool(
  'jira_assign_issue',
  'Assign a Jira issue to a user. Pass null as accountId to unassign.',
  {
    issueIdOrKey: z.string().describe('Issue key (e.g. "PROJ-123") or numeric ID'),
    accountId: z
      .string()
      .nullable()
      .describe('Atlassian account ID of the assignee, or null to unassign'),
  },
  async ({ issueIdOrKey, accountId }) => {
    try {
      const result = await jiraApi(`/issue/${encodeURIComponent(issueIdOrKey)}/assignee`, {
        method: 'PUT',
        body: { accountId },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_list_projects ---------------------------------------------------

server.tool(
  'jira_list_projects',
  'List all accessible Jira projects. Results are paginated.',
  {
    startAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Index of the first project to return (default 0)'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of projects (1-100, default 50)'),
    query: z
      .string()
      .optional()
      .describe('Filter projects by name (substring match)'),
  },
  async ({ startAt, maxResults, query }) => {
    try {
      const q: Record<string, string | undefined> = {}
      if (startAt !== undefined) q.startAt = String(startAt)
      if (maxResults !== undefined) q.maxResults = String(maxResults)
      if (query !== undefined) q.query = query

      const result = await jiraApi('/project/search', { query: q })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_get_project -----------------------------------------------------

server.tool(
  'jira_get_project',
  'Get detailed information about a Jira project.',
  {
    projectIdOrKey: z.string().describe('Project key (e.g. "PROJ") or numeric ID'),
    expand: z
      .string()
      .optional()
      .describe('Comma-separated list of expansions (e.g. "description,lead,issueTypes")'),
  },
  async ({ projectIdOrKey, expand }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (expand !== undefined) query.expand = expand

      const result = await jiraApi(`/project/${encodeURIComponent(projectIdOrKey)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_list_sprints ----------------------------------------------------

server.tool(
  'jira_list_sprints',
  'List sprints for an agile board. Uses the Jira Agile REST API.',
  {
    boardId: z.number().int().describe('The ID of the agile board'),
    state: z
      .enum(['future', 'active', 'closed'])
      .optional()
      .describe('Filter sprints by state'),
    startAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Index of the first sprint to return (default 0)'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of sprints (1-100, default 50)'),
  },
  async ({ boardId, state, startAt, maxResults }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (state !== undefined) query.state = state
      if (startAt !== undefined) query.startAt = String(startAt)
      if (maxResults !== undefined) query.maxResults = String(maxResults)

      const result = await jiraAgileApi(`/board/${boardId}/sprint`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_add_to_sprint ---------------------------------------------------

server.tool(
  'jira_add_to_sprint',
  'Move one or more issues into a sprint. Uses the Jira Agile REST API.',
  {
    sprintId: z.number().int().describe('The ID of the sprint to move issues into'),
    issueKeys: z
      .array(z.string())
      .describe('Array of issue keys to add to the sprint (e.g. ["PROJ-1", "PROJ-2"])'),
  },
  async ({ sprintId, issueKeys }) => {
    try {
      const result = await jiraAgileApi(`/sprint/${sprintId}/issue`, {
        method: 'POST',
        body: { issues: issueKeys },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_list_boards -----------------------------------------------------

server.tool(
  'jira_list_boards',
  'List agile boards. Uses the Jira Agile REST API.',
  {
    type: z
      .enum(['scrum', 'kanban'])
      .optional()
      .describe('Filter boards by type'),
    name: z
      .string()
      .optional()
      .describe('Filter boards by name (substring match)'),
    projectKeyOrId: z
      .string()
      .optional()
      .describe('Filter boards by project key or ID'),
    startAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Index of the first board to return (default 0)'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of boards (1-100, default 50)'),
  },
  async ({ type, name, projectKeyOrId, startAt, maxResults }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (type !== undefined) query.type = type
      if (name !== undefined) query.name = name
      if (projectKeyOrId !== undefined) query.projectKeyOrId = projectKeyOrId
      if (startAt !== undefined) query.startAt = String(startAt)
      if (maxResults !== undefined) query.maxResults = String(maxResults)

      const result = await jiraAgileApi('/board', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_create_sprint ---------------------------------------------------

server.tool(
  'jira_create_sprint',
  'Create a new sprint in an agile board. Uses the Jira Agile REST API.',
  {
    name: z.string().describe('Sprint name'),
    boardId: z.number().int().describe('The ID of the board to create the sprint in'),
    startDate: z
      .string()
      .optional()
      .describe('Sprint start date in ISO 8601 format (e.g. "2024-01-15T00:00:00.000Z")'),
    endDate: z
      .string()
      .optional()
      .describe('Sprint end date in ISO 8601 format'),
    goal: z
      .string()
      .optional()
      .describe('Sprint goal description'),
  },
  async ({ name, boardId, startDate, endDate, goal }) => {
    try {
      const body: Record<string, unknown> = { name, originBoardId: boardId }
      if (startDate !== undefined) body.startDate = startDate
      if (endDate !== undefined) body.endDate = endDate
      if (goal !== undefined) body.goal = goal

      const result = await jiraAgileApi('/sprint', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- jira_list_statuses ---------------------------------------------------

server.tool(
  'jira_list_statuses',
  'List all available issue statuses in Jira, optionally filtered by project.',
  {
    projectIdOrKey: z
      .string()
      .optional()
      .describe('Filter statuses by project key or ID'),
  },
  async ({ projectIdOrKey }) => {
    try {
      let result: unknown
      if (projectIdOrKey) {
        result = await jiraApi(`/project/${encodeURIComponent(projectIdOrKey)}/statuses`)
      } else {
        result = await jiraApi('/status')
      }
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
