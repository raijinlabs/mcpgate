/**
 * GitHub MCP Server -- Production-ready
 *
 * Provides tools to interact with the GitHub REST API on behalf of the
 * authenticated user.  Credentials are injected via the GITHUB_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   github_create_issue   -- Create a GitHub issue
 *   github_list_repos     -- List repositories for the authenticated user
 *   github_create_pr      -- Create a pull request
 *   github_get_file       -- Retrieve file contents from a repository
 *   github_search_code    -- Search code across GitHub
 *   github_get_repo       -- Get repository details
 *   github_list_prs       -- List pull requests for a repository
 *   github_get_pr         -- Get a single pull request
 *   github_merge_pr       -- Merge a pull request
 *   github_create_comment -- Create a comment on an issue or PR
 *   github_list_comments  -- List comments on an issue or PR
 *   github_create_branch  -- Create a new branch from a commit SHA
 *   github_list_branches  -- List branches for a repository
 *   github_delete_branch  -- Delete a branch
 *   github_add_labels     -- Add labels to an issue or PR
 *   github_remove_label   -- Remove a label from an issue or PR
 *   github_create_review  -- Create a review on a pull request
 *   github_list_reviews   -- List reviews on a pull request
 *   github_create_release -- Create a release
 *   github_list_releases  -- List releases for a repository
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_API = 'https://api.github.com'
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

class GitHubApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(detail: ApiErrorDetail) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'GitHub server error'
            : 'GitHub API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'GitHubApiError'
    this.status = detail.status
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof GitHubApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your GitHub token may be invalid or missing required scopes. Reconnect via /v1/auth/connect/github',
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
        hint: 'GitHub is experiencing issues. Please try again shortly.',
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

async function githubApi(
  path: string,
  opts: { method?: string; body?: unknown } = {},
  attempt = 0,
): Promise<unknown> {
  if (!GITHUB_TOKEN) {
    throw new Error(
      'GitHub token not configured. Connect via /v1/auth/connect/github',
    )
  }

  const res = await fetch(`${GITHUB_API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  // Rate-limit awareness: retry if under budget
  if (res.status === 429 || (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0')) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000

    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return githubApi(path, opts, attempt + 1)
    }

    const body = await res.text()
    throw new GitHubApiError({ status: 429, body, retryAfterMs: retryMs })
  }

  if (!res.ok) {
    const body = await res.text()
    throw new GitHubApiError({ status: res.status, body })
  }

  // 204 No Content
  if (res.status === 204) return {}
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'github-mcp',
  version: '0.1.0',
})

// ---- github_create_issue --------------------------------------------------

server.tool(
  'github_create_issue',
  'Create a new issue in a GitHub repository. Returns the created issue including its number and URL.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    title: z.string().describe('Issue title'),
    body: z.string().optional().describe('Issue body in Markdown'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Labels to apply to the issue'),
  },
  async ({ owner, repo, title, body, labels }) => {
    try {
      const payload: Record<string, unknown> = { title }
      if (body !== undefined) payload.body = body
      if (labels !== undefined) payload.labels = labels

      const result = await githubApi(`/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_repos ----------------------------------------------------

server.tool(
  'github_list_repos',
  'List repositories for the authenticated GitHub user. Results are paginated.',
  {
    sort: z
      .enum(['created', 'updated', 'pushed', 'full_name'])
      .optional()
      .describe('Sort field for the repository list'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ sort, per_page }) => {
    try {
      const params = new URLSearchParams()
      if (sort) params.set('sort', sort)
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const qs = params.toString()
      const result = await githubApi(`/user/repos${qs ? `?${qs}` : ''}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_create_pr -----------------------------------------------------

server.tool(
  'github_create_pr',
  'Create a pull request in a GitHub repository. Returns the created PR including its number and URL.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    title: z.string().describe('Pull request title'),
    body: z.string().optional().describe('Pull request description in Markdown'),
    head: z
      .string()
      .describe(
        'The branch (or user:branch for cross-repo) containing your changes',
      ),
    base: z.string().describe('The branch you want the changes pulled into'),
  },
  async ({ owner, repo, title, body, head, base }) => {
    try {
      const payload: Record<string, unknown> = { title, head, base }
      if (body !== undefined) payload.body = body

      const result = await githubApi(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_get_file ------------------------------------------------------

server.tool(
  'github_get_file',
  'Retrieve the contents of a file from a GitHub repository. The content is returned Base64-encoded for binary safety; text files also include a decoded preview.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    path: z.string().describe('Path to the file inside the repository'),
    ref: z
      .string()
      .optional()
      .describe(
        'Git ref (branch, tag, or SHA) to read from. Defaults to the repo default branch.',
      ),
  },
  async ({ owner, repo, path, ref }) => {
    try {
      const params = new URLSearchParams()
      if (ref) params.set('ref', ref)
      const qs = params.toString()

      const result = await githubApi(
        `/repos/${owner}/${repo}/contents/${path}${qs ? `?${qs}` : ''}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_search_code ---------------------------------------------------

server.tool(
  'github_search_code',
  'Search for code across GitHub repositories. Supports GitHub search qualifiers (e.g. "language:typescript repo:owner/name"). Returns matching file fragments.',
  {
    query: z
      .string()
      .describe(
        'Search query using GitHub code search syntax (e.g. "addClass language:javascript")',
      ),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ query, per_page }) => {
    try {
      const params = new URLSearchParams({ q: query })
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const result = await githubApi(`/search/code?${params.toString()}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_get_repo -----------------------------------------------------

server.tool(
  'github_get_repo',
  'Get detailed information about a GitHub repository including stars, forks, language, and default branch.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
  },
  async ({ owner, repo }) => {
    try {
      const result = await githubApi(`/repos/${owner}/${repo}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_prs -----------------------------------------------------

server.tool(
  'github_list_prs',
  'List pull requests for a GitHub repository. Results are paginated and can be filtered by state.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    state: z
      .enum(['open', 'closed', 'all'])
      .optional()
      .describe('Filter by PR state (default: open)'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ owner, repo, state, per_page }) => {
    try {
      const params = new URLSearchParams()
      if (state) params.set('state', state)
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const qs = params.toString()
      const result = await githubApi(
        `/repos/${owner}/${repo}/pulls${qs ? `?${qs}` : ''}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_get_pr -------------------------------------------------------

server.tool(
  'github_get_pr',
  'Get detailed information about a single pull request including diff stats, mergeable status, and review state.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    pull_number: z.number().int().describe('Pull request number'),
  },
  async ({ owner, repo, pull_number }) => {
    try {
      const result = await githubApi(
        `/repos/${owner}/${repo}/pulls/${pull_number}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_merge_pr -----------------------------------------------------

server.tool(
  'github_merge_pr',
  'Merge a pull request. Supports merge, squash, and rebase strategies.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    pull_number: z.number().int().describe('Pull request number'),
    merge_method: z
      .enum(['merge', 'squash', 'rebase'])
      .optional()
      .describe('Merge strategy to use (default: merge)'),
    commit_title: z
      .string()
      .optional()
      .describe('Custom title for the merge commit'),
    commit_message: z
      .string()
      .optional()
      .describe('Custom body for the merge commit'),
  },
  async ({ owner, repo, pull_number, merge_method, commit_title, commit_message }) => {
    try {
      const payload: Record<string, unknown> = {}
      if (merge_method !== undefined) payload.merge_method = merge_method
      if (commit_title !== undefined) payload.commit_title = commit_title
      if (commit_message !== undefined) payload.commit_message = commit_message

      const result = await githubApi(
        `/repos/${owner}/${repo}/pulls/${pull_number}/merge`,
        { method: 'PUT', body: payload },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_create_comment -----------------------------------------------

server.tool(
  'github_create_comment',
  'Create a comment on a GitHub issue or pull request. Returns the created comment.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    issue_number: z
      .number()
      .int()
      .describe('Issue or pull request number'),
    body: z.string().describe('Comment body in Markdown'),
  },
  async ({ owner, repo, issue_number, body }) => {
    try {
      const result = await githubApi(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments`,
        { method: 'POST', body: { body } },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_comments ------------------------------------------------

server.tool(
  'github_list_comments',
  'List comments on a GitHub issue or pull request. Results are paginated.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    issue_number: z
      .number()
      .int()
      .describe('Issue or pull request number'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ owner, repo, issue_number, per_page }) => {
    try {
      const params = new URLSearchParams()
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const qs = params.toString()
      const result = await githubApi(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments${qs ? `?${qs}` : ''}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_create_branch ------------------------------------------------

server.tool(
  'github_create_branch',
  'Create a new branch in a GitHub repository from a given commit SHA.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    branch_name: z.string().describe('Name of the new branch to create'),
    from_sha: z
      .string()
      .describe('The commit SHA to create the branch from'),
  },
  async ({ owner, repo, branch_name, from_sha }) => {
    try {
      const result = await githubApi(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${branch_name}`, sha: from_sha },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_branches ------------------------------------------------

server.tool(
  'github_list_branches',
  'List branches for a GitHub repository. Results are paginated.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ owner, repo, per_page }) => {
    try {
      const params = new URLSearchParams()
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const qs = params.toString()
      const result = await githubApi(
        `/repos/${owner}/${repo}/branches${qs ? `?${qs}` : ''}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_delete_branch ------------------------------------------------

server.tool(
  'github_delete_branch',
  'Delete a branch from a GitHub repository. Returns confirmation on success.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    branch: z.string().describe('Branch name to delete'),
  },
  async ({ owner, repo, branch }) => {
    try {
      await githubApi(
        `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        { method: 'DELETE' },
      )
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_add_labels ---------------------------------------------------

server.tool(
  'github_add_labels',
  'Add one or more labels to a GitHub issue or pull request. Returns the full list of labels on the issue.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    issue_number: z
      .number()
      .int()
      .describe('Issue or pull request number'),
    labels: z
      .array(z.string())
      .describe('Array of label names to add'),
  },
  async ({ owner, repo, issue_number, labels }) => {
    try {
      const result = await githubApi(
        `/repos/${owner}/${repo}/issues/${issue_number}/labels`,
        { method: 'POST', body: { labels } },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_remove_label -------------------------------------------------

server.tool(
  'github_remove_label',
  'Remove a label from a GitHub issue or pull request.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    issue_number: z
      .number()
      .int()
      .describe('Issue or pull request number'),
    label: z.string().describe('Label name to remove'),
  },
  async ({ owner, repo, issue_number, label }) => {
    try {
      const result = await githubApi(
        `/repos/${owner}/${repo}/issues/${issue_number}/labels/${encodeURIComponent(label)}`,
        { method: 'DELETE' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_create_review ------------------------------------------------

server.tool(
  'github_create_review',
  'Create a review on a GitHub pull request. Use event to approve, request changes, or leave a comment.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    pull_number: z.number().int().describe('Pull request number'),
    body: z
      .string()
      .optional()
      .describe('Review comment body in Markdown'),
    event: z
      .enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'])
      .describe('Review action: APPROVE, REQUEST_CHANGES, or COMMENT'),
  },
  async ({ owner, repo, pull_number, body, event }) => {
    try {
      const payload: Record<string, unknown> = { event }
      if (body !== undefined) payload.body = body

      const result = await githubApi(
        `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`,
        { method: 'POST', body: payload },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_reviews -------------------------------------------------

server.tool(
  'github_list_reviews',
  'List reviews on a GitHub pull request.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    pull_number: z.number().int().describe('Pull request number'),
  },
  async ({ owner, repo, pull_number }) => {
    try {
      const result = await githubApi(
        `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_create_release -----------------------------------------------

server.tool(
  'github_create_release',
  'Create a new release in a GitHub repository. Returns the created release including its upload URL for assets.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    tag_name: z.string().describe('Tag name for the release (e.g. "v1.0.0")'),
    name: z
      .string()
      .optional()
      .describe('Release title'),
    body: z
      .string()
      .optional()
      .describe('Release notes in Markdown'),
    draft: z
      .boolean()
      .optional()
      .describe('Whether to create the release as a draft (default: false)'),
    prerelease: z
      .boolean()
      .optional()
      .describe('Whether to mark the release as a prerelease (default: false)'),
  },
  async ({ owner, repo, tag_name, name, body, draft, prerelease }) => {
    try {
      const payload: Record<string, unknown> = { tag_name }
      if (name !== undefined) payload.name = name
      if (body !== undefined) payload.body = body
      if (draft !== undefined) payload.draft = draft
      if (prerelease !== undefined) payload.prerelease = prerelease

      const result = await githubApi(`/repos/${owner}/${repo}/releases`, {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- github_list_releases ------------------------------------------------

server.tool(
  'github_list_releases',
  'List releases for a GitHub repository. Results are paginated.',
  {
    owner: z.string().describe('Repository owner (user or organisation)'),
    repo: z.string().describe('Repository name'),
    per_page: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results per page (1-100, default 30)'),
  },
  async ({ owner, repo, per_page }) => {
    try {
      const params = new URLSearchParams()
      if (per_page !== undefined) params.set('per_page', String(per_page))

      const qs = params.toString()
      const result = await githubApi(
        `/repos/${owner}/${repo}/releases${qs ? `?${qs}` : ''}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
