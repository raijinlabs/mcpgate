/**
 * Vercel MCP Server -- Production-ready
 *
 * Provides tools to interact with the Vercel REST API on behalf of the
 * authenticated user.  Credentials are injected via the VERCEL_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   vercel_list_projects     -- List projects
 *   vercel_get_project       -- Get a single project
 *   vercel_list_deployments  -- List deployments
 *   vercel_get_deployment    -- Get a single deployment
 *   vercel_create_deployment -- Create a deployment
 *   vercel_list_domains      -- List domains
 *   vercel_add_domain        -- Add a domain
 *   vercel_list_env_vars     -- List environment variables for a project
 *   vercel_create_env_var    -- Create an environment variable
 *   vercel_get_user          -- Get authenticated user info
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'vercel',
  baseUrl: 'https://api.vercel.com',
  tokenEnvVar: 'VERCEL_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'vercel-mcp',
  version: '0.1.0',
})

// ---- vercel_list_projects -------------------------------------------------

server.tool(
  'vercel_list_projects',
  'List projects in the Vercel account. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of projects to return (1-100, default 20)'),
    from: z
      .string()
      .optional()
      .describe('Pagination cursor -- project ID to start after'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter projects by name'),
  },
  async ({ limit, from, search }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (from !== undefined) query.from = from
      if (search !== undefined) query.search = search

      const result = await call('/v9/projects', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_get_project ---------------------------------------------------

server.tool(
  'vercel_get_project',
  'Get details of a single Vercel project by ID or name.',
  {
    project_id: z.string().describe('Project ID or name'),
  },
  async ({ project_id }) => {
    try {
      const result = await call(`/v9/projects/${encodeURIComponent(project_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_list_deployments ----------------------------------------------

server.tool(
  'vercel_list_deployments',
  'List deployments in the Vercel account. Can be filtered by project or state.',
  {
    project_id: z
      .string()
      .optional()
      .describe('Filter deployments by project ID or name'),
    state: z
      .enum(['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED'])
      .optional()
      .describe('Filter deployments by state'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of deployments to return (1-100, default 20)'),
    from: z
      .string()
      .optional()
      .describe('Pagination cursor -- timestamp in milliseconds'),
    target: z
      .enum(['production', 'preview'])
      .optional()
      .describe('Filter by deployment target'),
  },
  async ({ project_id, state, limit, from, target }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (project_id !== undefined) query.projectId = project_id
      if (state !== undefined) query.state = state
      if (limit !== undefined) query.limit = String(limit)
      if (from !== undefined) query.from = from
      if (target !== undefined) query.target = target

      const result = await call('/v6/deployments', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_get_deployment ------------------------------------------------

server.tool(
  'vercel_get_deployment',
  'Get details of a single deployment by its ID or URL.',
  {
    deployment_id: z.string().describe('Deployment ID or URL'),
  },
  async ({ deployment_id }) => {
    try {
      const result = await call(`/v13/deployments/${encodeURIComponent(deployment_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_create_deployment ---------------------------------------------

server.tool(
  'vercel_create_deployment',
  'Create a new deployment. Typically used to trigger a redeployment from a Git reference. Returns the created deployment.',
  {
    name: z.string().describe('Project name for the deployment'),
    target: z
      .enum(['production', 'preview', 'staging'])
      .optional()
      .describe('Deployment target environment (default: preview)'),
    git_source: z
      .object({
        type: z.enum(['github', 'gitlab', 'bitbucket']).describe('Git provider type'),
        ref: z.string().describe('Git reference (branch, tag, or commit SHA)'),
        repoId: z.string().optional().describe('Repository ID from the Git provider'),
      })
      .optional()
      .describe('Git source configuration for the deployment'),
    project_settings: z
      .record(z.string())
      .optional()
      .describe('Project settings overrides (e.g. buildCommand, outputDirectory)'),
  },
  async ({ name, target, git_source, project_settings }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (target !== undefined) body.target = target
      if (git_source !== undefined) body.gitSource = git_source
      if (project_settings !== undefined) body.projectSettings = project_settings

      const result = await call('/v13/deployments', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_list_domains --------------------------------------------------

server.tool(
  'vercel_list_domains',
  'List domains registered in the Vercel account.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of domains to return (1-100, default 20)'),
    since: z
      .number()
      .optional()
      .describe('Timestamp in milliseconds to filter domains created after'),
    until: z
      .number()
      .optional()
      .describe('Timestamp in milliseconds to filter domains created before'),
  },
  async ({ limit, since, until }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (since !== undefined) query.since = String(since)
      if (until !== undefined) query.until = String(until)

      const result = await call('/v5/domains', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_add_domain ----------------------------------------------------

server.tool(
  'vercel_add_domain',
  'Add a domain to the Vercel account. Returns the created domain object.',
  {
    name: z.string().describe('Domain name to add (e.g. "example.com")'),
  },
  async ({ name }) => {
    try {
      const result = await call('/v5/domains', {
        method: 'POST',
        body: { name },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_list_env_vars -------------------------------------------------

server.tool(
  'vercel_list_env_vars',
  'List environment variables for a Vercel project. Returns variable names, targets, and (redacted) values.',
  {
    project_id: z.string().describe('Project ID or name'),
    target: z
      .enum(['production', 'preview', 'development'])
      .optional()
      .describe('Filter by deployment target'),
    decrypt: z
      .boolean()
      .optional()
      .describe('Whether to decrypt values (requires special permissions)'),
  },
  async ({ project_id, target, decrypt }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (target !== undefined) query.target = target
      if (decrypt !== undefined) query.decrypt = String(decrypt)

      const result = await call(`/v9/projects/${encodeURIComponent(project_id)}/env`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_create_env_var ------------------------------------------------

server.tool(
  'vercel_create_env_var',
  'Create a new environment variable for a Vercel project. Returns the created variable.',
  {
    project_id: z.string().describe('Project ID or name'),
    key: z.string().describe('Environment variable name'),
    value: z.string().describe('Environment variable value'),
    target: z
      .array(z.enum(['production', 'preview', 'development']))
      .describe('Array of deployment targets for this variable'),
    type: z
      .enum(['system', 'secret', 'encrypted', 'plain', 'sensitive'])
      .optional()
      .describe('Variable type (default: encrypted)'),
    git_branch: z
      .string()
      .optional()
      .describe('Git branch to scope this variable to (only for preview target)'),
  },
  async ({ project_id, key, value, target, type, git_branch }) => {
    try {
      const body: Record<string, unknown> = { key, value, target }
      if (type !== undefined) body.type = type
      if (git_branch !== undefined) body.gitBranch = git_branch

      const result = await call(`/v9/projects/${encodeURIComponent(project_id)}/env`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- vercel_get_user ------------------------------------------------------

server.tool(
  'vercel_get_user',
  'Get information about the currently authenticated Vercel user. Returns username, email, and account details.',
  {},
  async () => {
    try {
      const result = await call('/v2/user')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
