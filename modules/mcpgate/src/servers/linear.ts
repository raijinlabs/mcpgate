/**
 * Linear MCP Server -- Production-ready
 *
 * Provides tools to interact with the Linear GraphQL API on behalf of the
 * authenticated user.  Credentials are injected via the LINEAR_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   linear_create_issue   -- Create a new issue
 *   linear_get_issue      -- Get issue details by ID or identifier
 *   linear_update_issue   -- Update an existing issue
 *   linear_list_issues    -- List issues with optional filters
 *   linear_search_issues  -- Full-text search across issues
 *   linear_create_project -- Create a new project
 *   linear_list_projects  -- List projects
 *   linear_create_comment -- Add a comment to an issue
 *   linear_list_teams     -- List all teams
 *   linear_assign_issue   -- Assign an issue to a user
 *   linear_add_label      -- Add a label to an issue
 *   linear_list_labels    -- List available labels
 *   linear_list_cycles    -- List cycles for a team
 *   linear_create_cycle   -- Create a new cycle
 *   linear_update_project -- Update a project
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createGraphQLClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

const { query, categoriseError } = createGraphQLClient({
  name: 'linear',
  endpoint: 'https://api.linear.app/graphql',
  tokenEnvVar: 'LINEAR_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'linear-mcp',
  version: '0.1.0',
})

// ---- linear_create_issue --------------------------------------------------

server.tool(
  'linear_create_issue',
  'Create a new issue in Linear. Returns the created issue including its identifier and URL.',
  {
    teamId: z.string().describe('The ID of the team to create the issue in'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description in Markdown'),
    priority: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe('Priority: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low'),
    assigneeId: z.string().optional().describe('The ID of the user to assign the issue to'),
    stateId: z.string().optional().describe('The ID of the workflow state for the issue'),
    labelIds: z
      .array(z.string())
      .optional()
      .describe('Array of label IDs to attach to the issue'),
    cycleId: z.string().optional().describe('The ID of the cycle to add the issue to'),
    projectId: z.string().optional().describe('The ID of the project to associate with'),
  },
  async ({ teamId, title, description, priority, assigneeId, stateId, labelIds, cycleId, projectId }) => {
    try {
      const gql = `
        mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              url
              priority
              state { id name }
              assignee { id name }
              team { id name }
              labels { nodes { id name } }
              createdAt
            }
          }
        }
      `
      const input: Record<string, unknown> = { teamId, title }
      if (description !== undefined) input.description = description
      if (priority !== undefined) input.priority = priority
      if (assigneeId !== undefined) input.assigneeId = assigneeId
      if (stateId !== undefined) input.stateId = stateId
      if (labelIds !== undefined) input.labelIds = labelIds
      if (cycleId !== undefined) input.cycleId = cycleId
      if (projectId !== undefined) input.projectId = projectId

      const result = await query(gql, { input })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_get_issue -----------------------------------------------------

server.tool(
  'linear_get_issue',
  'Retrieve a Linear issue by its ID or identifier (e.g. "ENG-123"). Returns full issue details including state, assignee, labels, and comments.',
  {
    issueId: z
      .string()
      .describe('The issue UUID or short identifier (e.g. "ENG-123")'),
  },
  async ({ issueId }) => {
    try {
      const gql = `
        query GetIssue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            url
            priority
            priorityLabel
            state { id name color }
            assignee { id name email }
            team { id name key }
            labels { nodes { id name color } }
            project { id name }
            cycle { id name number }
            comments { nodes { id body user { id name } createdAt } }
            createdAt
            updatedAt
          }
        }
      `
      const result = await query(gql, { id: issueId })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_update_issue --------------------------------------------------

server.tool(
  'linear_update_issue',
  'Update an existing Linear issue. Only provided fields are modified. Returns the updated issue.',
  {
    issueId: z.string().describe('The ID of the issue to update'),
    title: z.string().optional().describe('New title for the issue'),
    description: z.string().optional().describe('New description in Markdown'),
    priority: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe('Priority: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low'),
    stateId: z.string().optional().describe('New workflow state ID'),
    assigneeId: z.string().optional().describe('New assignee user ID (null to unassign)'),
    labelIds: z
      .array(z.string())
      .optional()
      .describe('Replace all labels with these label IDs'),
    cycleId: z.string().optional().describe('Move the issue to this cycle'),
    projectId: z.string().optional().describe('Associate the issue with this project'),
  },
  async ({ issueId, title, description, priority, stateId, assigneeId, labelIds, cycleId, projectId }) => {
    try {
      const gql = `
        mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              description
              url
              priority
              state { id name }
              assignee { id name }
              labels { nodes { id name } }
              updatedAt
            }
          }
        }
      `
      const input: Record<string, unknown> = {}
      if (title !== undefined) input.title = title
      if (description !== undefined) input.description = description
      if (priority !== undefined) input.priority = priority
      if (stateId !== undefined) input.stateId = stateId
      if (assigneeId !== undefined) input.assigneeId = assigneeId
      if (labelIds !== undefined) input.labelIds = labelIds
      if (cycleId !== undefined) input.cycleId = cycleId
      if (projectId !== undefined) input.projectId = projectId

      const result = await query(gql, { id: issueId, input })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_list_issues ---------------------------------------------------

server.tool(
  'linear_list_issues',
  'List issues in Linear with optional filters. Supports filtering by team, assignee, state, and label. Results are paginated.',
  {
    teamId: z.string().optional().describe('Filter by team ID'),
    assigneeId: z.string().optional().describe('Filter by assignee user ID'),
    stateId: z.string().optional().describe('Filter by workflow state ID'),
    labelId: z.string().optional().describe('Filter by label ID'),
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of issues to return (1-100, default 50)'),
    after: z
      .string()
      .optional()
      .describe('Cursor for pagination -- pass endCursor from previous response'),
  },
  async ({ teamId, assigneeId, stateId, labelId, first, after }) => {
    try {
      const gql = `
        query ListIssues($filter: IssueFilter, $first: Int, $after: String) {
          issues(filter: $filter, first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              identifier
              title
              url
              priority
              priorityLabel
              state { id name }
              assignee { id name }
              team { id name key }
              labels { nodes { id name } }
              createdAt
              updatedAt
            }
          }
        }
      `
      const filter: Record<string, unknown> = {}
      if (teamId) filter.team = { id: { eq: teamId } }
      if (assigneeId) filter.assignee = { id: { eq: assigneeId } }
      if (stateId) filter.state = { id: { eq: stateId } }
      if (labelId) filter.labels = { id: { eq: labelId } }

      const variables: Record<string, unknown> = {
        first: first ?? 50,
      }
      if (Object.keys(filter).length > 0) variables.filter = filter
      if (after) variables.after = after

      const result = await query(gql, variables)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_search_issues -------------------------------------------------

server.tool(
  'linear_search_issues',
  'Full-text search across Linear issues. Returns matching issues ranked by relevance.',
  {
    queryStr: z.string().describe('Search query string'),
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results to return (1-100, default 25)'),
  },
  async ({ queryStr, first }) => {
    try {
      const gql = `
        query SearchIssues($query: String!, $first: Int) {
          searchIssues(query: $query, first: $first) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              identifier
              title
              url
              priority
              priorityLabel
              state { id name }
              assignee { id name }
              team { id name key }
              labels { nodes { id name } }
              createdAt
            }
          }
        }
      `
      const result = await query(gql, {
        query: queryStr,
        first: first ?? 25,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_create_project ------------------------------------------------

server.tool(
  'linear_create_project',
  'Create a new project in Linear. Returns the created project.',
  {
    name: z.string().describe('Project name'),
    teamIds: z.array(z.string()).describe('Array of team IDs to associate with the project'),
    description: z.string().optional().describe('Project description in Markdown'),
    state: z
      .enum(['planned', 'started', 'paused', 'completed', 'canceled'])
      .optional()
      .describe('Initial project state (default: planned)'),
    targetDate: z
      .string()
      .optional()
      .describe('Target completion date in ISO 8601 format (YYYY-MM-DD)'),
  },
  async ({ name, teamIds, description, state, targetDate }) => {
    try {
      const gql = `
        mutation ProjectCreate($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project {
              id
              name
              description
              url
              state
              targetDate
              teams { nodes { id name } }
              createdAt
            }
          }
        }
      `
      const input: Record<string, unknown> = { name, teamIds }
      if (description !== undefined) input.description = description
      if (state !== undefined) input.state = state
      if (targetDate !== undefined) input.targetDate = targetDate

      const result = await query(gql, { input })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_list_projects -------------------------------------------------

server.tool(
  'linear_list_projects',
  'List projects in Linear. Results are paginated.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of projects to return (1-100, default 50)'),
    after: z
      .string()
      .optional()
      .describe('Cursor for pagination -- pass endCursor from previous response'),
  },
  async ({ first, after }) => {
    try {
      const gql = `
        query ListProjects($first: Int, $after: String) {
          projects(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              name
              description
              url
              state
              targetDate
              teams { nodes { id name } }
              members { nodes { id name } }
              createdAt
              updatedAt
            }
          }
        }
      `
      const result = await query(gql, {
        first: first ?? 50,
        after: after || undefined,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_create_comment ------------------------------------------------

server.tool(
  'linear_create_comment',
  'Add a comment to a Linear issue. Returns the created comment.',
  {
    issueId: z.string().describe('The ID of the issue to comment on'),
    body: z.string().describe('Comment body in Markdown'),
  },
  async ({ issueId, body }) => {
    try {
      const gql = `
        mutation CommentCreate($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
              body
              url
              user { id name }
              issue { id identifier }
              createdAt
            }
          }
        }
      `
      const result = await query(gql, {
        input: { issueId, body },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_list_teams ----------------------------------------------------

server.tool(
  'linear_list_teams',
  'List all teams in the Linear workspace. Returns team details including keys, members, and states.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of teams to return (1-100, default 50)'),
  },
  async ({ first }) => {
    try {
      const gql = `
        query ListTeams($first: Int) {
          teams(first: $first) {
            nodes {
              id
              name
              key
              description
              states { nodes { id name color type } }
              members { nodes { id name email } }
            }
          }
        }
      `
      const result = await query(gql, { first: first ?? 50 })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_assign_issue --------------------------------------------------

server.tool(
  'linear_assign_issue',
  'Assign a Linear issue to a specific user. Pass null as assigneeId to unassign. Returns the updated issue.',
  {
    issueId: z.string().describe('The ID of the issue to assign'),
    assigneeId: z
      .string()
      .nullable()
      .describe('The user ID to assign the issue to, or null to unassign'),
  },
  async ({ issueId, assigneeId }) => {
    try {
      const gql = `
        mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              assignee { id name email }
              updatedAt
            }
          }
        }
      `
      const result = await query(gql, {
        id: issueId,
        input: { assigneeId },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_add_label -----------------------------------------------------

server.tool(
  'linear_add_label',
  'Add a label to a Linear issue. Fetches current labels and appends the new one. Returns the updated issue.',
  {
    issueId: z.string().describe('The ID of the issue to add the label to'),
    labelId: z.string().describe('The ID of the label to add'),
  },
  async ({ issueId, labelId }) => {
    try {
      // First, fetch existing labels on the issue
      const fetchGql = `
        query GetIssueLabels($id: String!) {
          issue(id: $id) {
            labels { nodes { id } }
          }
        }
      `
      const existing = await query<{ issue: { labels: { nodes: { id: string }[] } } }>(
        fetchGql,
        { id: issueId },
      )
      const currentIds = existing.issue.labels.nodes.map((l) => l.id)
      if (!currentIds.includes(labelId)) {
        currentIds.push(labelId)
      }

      const updateGql = `
        mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
              identifier
              title
              labels { nodes { id name color } }
              updatedAt
            }
          }
        }
      `
      const result = await query(updateGql, {
        id: issueId,
        input: { labelIds: currentIds },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_list_labels ---------------------------------------------------

server.tool(
  'linear_list_labels',
  'List all available labels in the Linear workspace. Returns label names, colors, and IDs.',
  {
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of labels to return (1-100, default 50)'),
  },
  async ({ first }) => {
    try {
      const gql = `
        query ListLabels($first: Int) {
          issueLabels(first: $first) {
            nodes {
              id
              name
              color
              description
              parent { id name }
              team { id name }
            }
          }
        }
      `
      const result = await query(gql, { first: first ?? 50 })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_list_cycles ---------------------------------------------------

server.tool(
  'linear_list_cycles',
  'List cycles for a specific team in Linear. Returns cycle details including progress.',
  {
    teamId: z.string().describe('The ID of the team whose cycles to list'),
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of cycles to return (1-100, default 25)'),
  },
  async ({ teamId, first }) => {
    try {
      const gql = `
        query ListCycles($teamId: String!, $first: Int) {
          team(id: $teamId) {
            cycles(first: $first) {
              nodes {
                id
                name
                number
                startsAt
                endsAt
                completedAt
                progress
                scopeCount: issueCountHistory
                completedScopeCount: completedIssueCountHistory
              }
            }
          }
        }
      `
      const result = await query(gql, {
        teamId,
        first: first ?? 25,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_create_cycle --------------------------------------------------

server.tool(
  'linear_create_cycle',
  'Create a new cycle for a team in Linear. Returns the created cycle.',
  {
    teamId: z.string().describe('The ID of the team to create the cycle for'),
    name: z.string().optional().describe('Cycle name (optional, auto-numbered if omitted)'),
    startsAt: z.string().describe('Cycle start date in ISO 8601 format (e.g. "2024-01-15")'),
    endsAt: z.string().describe('Cycle end date in ISO 8601 format (e.g. "2024-01-29")'),
    description: z.string().optional().describe('Cycle description'),
  },
  async ({ teamId, name, startsAt, endsAt, description }) => {
    try {
      const gql = `
        mutation CycleCreate($input: CycleCreateInput!) {
          cycleCreate(input: $input) {
            success
            cycle {
              id
              name
              number
              startsAt
              endsAt
              team { id name }
              createdAt
            }
          }
        }
      `
      const input: Record<string, unknown> = { teamId, startsAt, endsAt }
      if (name !== undefined) input.name = name
      if (description !== undefined) input.description = description

      const result = await query(gql, { input })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- linear_update_project ------------------------------------------------

server.tool(
  'linear_update_project',
  'Update an existing Linear project. Only provided fields are modified. Returns the updated project.',
  {
    projectId: z.string().describe('The ID of the project to update'),
    name: z.string().optional().describe('New project name'),
    description: z.string().optional().describe('New project description in Markdown'),
    state: z
      .enum(['planned', 'started', 'paused', 'completed', 'canceled'])
      .optional()
      .describe('New project state'),
    targetDate: z
      .string()
      .optional()
      .describe('New target completion date in ISO 8601 format (YYYY-MM-DD)'),
  },
  async ({ projectId, name, description, state, targetDate }) => {
    try {
      const gql = `
        mutation ProjectUpdate($id: String!, $input: ProjectUpdateInput!) {
          projectUpdate(id: $id, input: $input) {
            success
            project {
              id
              name
              description
              url
              state
              targetDate
              teams { nodes { id name } }
              updatedAt
            }
          }
        }
      `
      const input: Record<string, unknown> = {}
      if (name !== undefined) input.name = name
      if (description !== undefined) input.description = description
      if (state !== undefined) input.state = state
      if (targetDate !== undefined) input.targetDate = targetDate

      const result = await query(gql, { id: projectId, input })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
