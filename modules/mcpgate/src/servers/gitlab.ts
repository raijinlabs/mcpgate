/**
 * GitLab MCP Server -- Production-ready
 *
 * Provides tools to interact with the GitLab REST API (v4) on behalf of the
 * authenticated user.  Credentials are injected via the GITLAB_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Note: GitLab project paths must be URL-encoded when used in API URLs
 * (e.g. "my-group/my-project" becomes "my-group%2Fmy-project").
 *
 * Tools:
 *   gitlab_create_issue   -- Create a new issue
 *   gitlab_list_issues    -- List issues with filters
 *   gitlab_create_mr      -- Create a merge request
 *   gitlab_list_mrs       -- List merge requests
 *   gitlab_merge_mr       -- Merge a merge request
 *   gitlab_list_projects  -- List accessible projects
 *   gitlab_get_project    -- Get project details
 *   gitlab_create_branch  -- Create a new branch
 *   gitlab_list_branches  -- List branches
 *   gitlab_list_pipelines -- List CI/CD pipelines
 *   gitlab_get_pipeline   -- Get pipeline details
 *   gitlab_create_comment -- Add a note/comment on a merge request
 *   gitlab_list_commits   -- List commits for a project
 *   gitlab_get_file       -- Get file contents from a repository
 *   gitlab_search_code    -- Search code across projects
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'gitlab',
  baseUrl: 'https://gitlab.com/api/v4',
  tokenEnvVar: 'GITLAB_TOKEN',
  authStyle: 'bearer',
  defaultHeaders: { Accept: 'application/json' },
})

/**
 * URL-encode a GitLab project ID.  Accepts either a numeric ID (returned
 * as-is) or a path like "group/project" which must be percent-encoded.
 */
function encodeProjectId(projectId: string): string {
  // If it looks like a numeric ID, return as-is
  if (/^\d+$/.test(projectId)) return projectId
  return encodeURIComponent(projectId)
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'gitlab-mcp',
  version: '0.1.0',
})

// ---- gitlab_create_issue --------------------------------------------------

server.tool(
  'gitlab_create_issue',
  'Create a new issue in a GitLab project. Returns the created issue including its IID and web URL.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description in Markdown'),
    assignee_ids: z
      .array(z.number().int())
      .optional()
      .describe('Array of user IDs to assign'),
    labels: z.string().optional().describe('Comma-separated list of label names'),
    milestone_id: z.number().int().optional().describe('Milestone ID to associate with'),
    confidential: z.boolean().optional().describe('Whether the issue is confidential'),
  },
  async ({ projectId, title, description, assignee_ids, labels, milestone_id, confidential }) => {
    try {
      const body: Record<string, unknown> = { title }
      if (description !== undefined) body.description = description
      if (assignee_ids !== undefined) body.assignee_ids = assignee_ids
      if (labels !== undefined) body.labels = labels
      if (milestone_id !== undefined) body.milestone_id = milestone_id
      if (confidential !== undefined) body.confidential = confidential

      const result = await call(`/projects/${encodeProjectId(projectId)}/issues`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_issues ---------------------------------------------------

server.tool(
  'gitlab_list_issues',
  'List issues in a GitLab project with optional filters. Results are paginated.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    state: z
      .enum(['opened', 'closed', 'all'])
      .optional()
      .describe('Filter by issue state (default: all)'),
    labels: z
      .string()
      .optional()
      .describe('Comma-separated list of label names to filter by'),
    assignee_id: z.number().int().optional().describe('Filter by assignee user ID'),
    milestone: z.string().optional().describe('Filter by milestone title'),
    search: z.string().optional().describe('Search issues by title and description'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ projectId, state, labels, assignee_id, milestone, search, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (state !== undefined) query.state = state
      if (labels !== undefined) query.labels = labels
      if (assignee_id !== undefined) query.assignee_id = String(assignee_id)
      if (milestone !== undefined) query.milestone = milestone
      if (search !== undefined) query.search = search
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call(`/projects/${encodeProjectId(projectId)}/issues`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_create_mr -----------------------------------------------------

server.tool(
  'gitlab_create_mr',
  'Create a new merge request in a GitLab project. Returns the created MR including its IID and web URL.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    title: z.string().describe('Merge request title'),
    source_branch: z.string().describe('Source branch name'),
    target_branch: z.string().describe('Target branch name (e.g. "main")'),
    description: z.string().optional().describe('Merge request description in Markdown'),
    assignee_id: z.number().int().optional().describe('User ID to assign the MR to'),
    reviewer_ids: z
      .array(z.number().int())
      .optional()
      .describe('Array of user IDs to request review from'),
    labels: z.string().optional().describe('Comma-separated list of label names'),
    milestone_id: z.number().int().optional().describe('Milestone ID to associate with'),
    remove_source_branch: z
      .boolean()
      .optional()
      .describe('Whether to remove the source branch after merge (default: false)'),
    squash: z.boolean().optional().describe('Whether to squash commits on merge'),
  },
  async ({
    projectId, title, source_branch, target_branch, description,
    assignee_id, reviewer_ids, labels, milestone_id, remove_source_branch, squash,
  }) => {
    try {
      const body: Record<string, unknown> = { title, source_branch, target_branch }
      if (description !== undefined) body.description = description
      if (assignee_id !== undefined) body.assignee_id = assignee_id
      if (reviewer_ids !== undefined) body.reviewer_ids = reviewer_ids
      if (labels !== undefined) body.labels = labels
      if (milestone_id !== undefined) body.milestone_id = milestone_id
      if (remove_source_branch !== undefined) body.remove_source_branch = remove_source_branch
      if (squash !== undefined) body.squash = squash

      const result = await call(`/projects/${encodeProjectId(projectId)}/merge_requests`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_mrs ------------------------------------------------------

server.tool(
  'gitlab_list_mrs',
  'List merge requests in a GitLab project. Results are paginated.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    state: z
      .enum(['opened', 'closed', 'merged', 'all'])
      .optional()
      .describe('Filter by MR state (default: all)'),
    labels: z
      .string()
      .optional()
      .describe('Comma-separated list of label names to filter by'),
    scope: z
      .enum(['created_by_me', 'assigned_to_me', 'all'])
      .optional()
      .describe('Filter by scope relative to the authenticated user'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ projectId, state, labels, scope, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (state !== undefined) query.state = state
      if (labels !== undefined) query.labels = labels
      if (scope !== undefined) query.scope = scope
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call(`/projects/${encodeProjectId(projectId)}/merge_requests`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_merge_mr ------------------------------------------------------

server.tool(
  'gitlab_merge_mr',
  'Merge a merge request. Returns the merged MR details.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    merge_request_iid: z.number().int().describe('Merge request IID (internal ID within the project)'),
    merge_commit_message: z.string().optional().describe('Custom merge commit message'),
    squash_commit_message: z.string().optional().describe('Custom squash commit message'),
    squash: z.boolean().optional().describe('Whether to squash commits'),
    should_remove_source_branch: z
      .boolean()
      .optional()
      .describe('Whether to remove the source branch after merge'),
  },
  async ({ projectId, merge_request_iid, merge_commit_message, squash_commit_message, squash, should_remove_source_branch }) => {
    try {
      const body: Record<string, unknown> = {}
      if (merge_commit_message !== undefined) body.merge_commit_message = merge_commit_message
      if (squash_commit_message !== undefined) body.squash_commit_message = squash_commit_message
      if (squash !== undefined) body.squash = squash
      if (should_remove_source_branch !== undefined) body.should_remove_source_branch = should_remove_source_branch

      const result = await call(
        `/projects/${encodeProjectId(projectId)}/merge_requests/${merge_request_iid}/merge`,
        { method: 'PUT', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_projects -------------------------------------------------

server.tool(
  'gitlab_list_projects',
  'List GitLab projects accessible by the authenticated user. Results are paginated.',
  {
    search: z.string().optional().describe('Search projects by name'),
    owned: z.boolean().optional().describe('Limit to projects owned by the authenticated user'),
    membership: z.boolean().optional().describe('Limit to projects the user is a member of'),
    visibility: z
      .enum(['public', 'internal', 'private'])
      .optional()
      .describe('Filter by project visibility'),
    order_by: z
      .enum(['id', 'name', 'created_at', 'updated_at', 'last_activity_at'])
      .optional()
      .describe('Order results by field'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ search, owned, membership, visibility, order_by, sort, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (owned !== undefined) query.owned = String(owned)
      if (membership !== undefined) query.membership = String(membership)
      if (visibility !== undefined) query.visibility = visibility
      if (order_by !== undefined) query.order_by = order_by
      if (sort !== undefined) query.sort = sort
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call('/projects', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_get_project ---------------------------------------------------

server.tool(
  'gitlab_get_project',
  'Get detailed information about a GitLab project including statistics, default branch, and visibility.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    statistics: z
      .boolean()
      .optional()
      .describe('Include project statistics (repository size, commit count, etc.)'),
  },
  async ({ projectId, statistics }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (statistics !== undefined) query.statistics = String(statistics)

      const result = await call(`/projects/${encodeProjectId(projectId)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_create_branch -------------------------------------------------

server.tool(
  'gitlab_create_branch',
  'Create a new branch in a GitLab project. Returns the created branch details.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    branch: z.string().describe('Name of the new branch to create'),
    ref: z.string().describe('Branch name, tag, or commit SHA to create the branch from'),
  },
  async ({ projectId, branch, ref }) => {
    try {
      const result = await call(`/projects/${encodeProjectId(projectId)}/repository/branches`, {
        method: 'POST',
        body: { branch, ref },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_branches -------------------------------------------------

server.tool(
  'gitlab_list_branches',
  'List branches in a GitLab project. Results are paginated.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    search: z.string().optional().describe('Filter branches by name (substring match)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ projectId, search, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call(`/projects/${encodeProjectId(projectId)}/repository/branches`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_pipelines ------------------------------------------------

server.tool(
  'gitlab_list_pipelines',
  'List CI/CD pipelines for a GitLab project. Results are paginated.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    status: z
      .enum(['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'success', 'failed', 'canceled', 'skipped', 'manual', 'scheduled'])
      .optional()
      .describe('Filter pipelines by status'),
    ref: z.string().optional().describe('Filter by branch or tag name'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ projectId, status, ref, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (status !== undefined) query.status = status
      if (ref !== undefined) query.ref = ref
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call(`/projects/${encodeProjectId(projectId)}/pipelines`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_get_pipeline --------------------------------------------------

server.tool(
  'gitlab_get_pipeline',
  'Get detailed information about a specific GitLab CI/CD pipeline including jobs and status.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    pipeline_id: z.number().int().describe('Pipeline ID'),
  },
  async ({ projectId, pipeline_id }) => {
    try {
      const result = await call(
        `/projects/${encodeProjectId(projectId)}/pipelines/${pipeline_id}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_create_comment ------------------------------------------------

server.tool(
  'gitlab_create_comment',
  'Add a note (comment) on a GitLab merge request. Returns the created note.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    merge_request_iid: z.number().int().describe('Merge request IID (internal ID within the project)'),
    body: z.string().describe('Note body in Markdown'),
  },
  async ({ projectId, merge_request_iid, body }) => {
    try {
      const result = await call(
        `/projects/${encodeProjectId(projectId)}/merge_requests/${merge_request_iid}/notes`,
        { method: 'POST', body: { body } },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_list_commits --------------------------------------------------

server.tool(
  'gitlab_list_commits',
  'List commits for a GitLab project. Results are paginated.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    ref_name: z.string().optional().describe('Branch or tag name to list commits from'),
    since: z.string().optional().describe('Only commits after this ISO 8601 date'),
    until: z.string().optional().describe('Only commits before this ISO 8601 date'),
    path: z.string().optional().describe('Filter commits to this file path'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ projectId, ref_name, since, until, path, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (ref_name !== undefined) query.ref_name = ref_name
      if (since !== undefined) query.since = since
      if (until !== undefined) query.until = until
      if (path !== undefined) query.path = path
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      const result = await call(`/projects/${encodeProjectId(projectId)}/repository/commits`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_get_file ------------------------------------------------------

server.tool(
  'gitlab_get_file',
  'Retrieve file contents from a GitLab repository. Returns the file content (Base64-encoded) along with metadata.',
  {
    projectId: z
      .string()
      .describe('Numeric project ID or URL-encoded path (e.g. "my-group/my-project")'),
    file_path: z.string().describe('Path to the file in the repository (e.g. "src/main.ts")'),
    ref: z
      .string()
      .optional()
      .describe('Branch name, tag, or commit SHA (defaults to the default branch)'),
  },
  async ({ projectId, file_path, ref }) => {
    try {
      const encodedPath = encodeURIComponent(file_path)
      const query: Record<string, string | undefined> = {}
      if (ref !== undefined) query.ref = ref

      const result = await call(
        `/projects/${encodeProjectId(projectId)}/repository/files/${encodedPath}`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gitlab_search_code ---------------------------------------------------

server.tool(
  'gitlab_search_code',
  'Search for code across GitLab projects. Can search within a specific project or globally. Returns matching file fragments with line numbers.',
  {
    search: z.string().describe('Search query string'),
    projectId: z
      .string()
      .optional()
      .describe('Scope search to a specific project (numeric ID or URL-encoded path). If omitted, searches globally.'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 20)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  },
  async ({ search, projectId, per_page, page }) => {
    try {
      const query: Record<string, string | undefined> = {
        search,
        scope: 'blobs',
      }
      if (per_page !== undefined) query.per_page = String(per_page)
      if (page !== undefined) query.page = String(page)

      let path: string
      if (projectId) {
        path = `/projects/${encodeProjectId(projectId)}/search`
      } else {
        path = '/search'
      }

      const result = await call(path, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
