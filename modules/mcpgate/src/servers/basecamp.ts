/**
 * Basecamp MCP Server -- Production-ready
 *
 * Provides tools to interact with the Basecamp 3 API on behalf of the
 * authenticated user.  Credentials are injected via the BASECAMP_TOKEN
 * and BASECAMP_ACCOUNT_ID environment variables (set by the MCPGate gateway).
 *
 * Tools:
 *   basecamp_list_projects  -- List projects
 *   basecamp_get_project    -- Get a single project
 *   basecamp_create_project -- Create a new project
 *   basecamp_list_todolists -- List to-do lists in a project
 *   basecamp_create_todolist -- Create a to-do list
 *   basecamp_create_todo    -- Create a to-do item
 *   basecamp_list_messages  -- List messages in a project
 *   basecamp_create_message -- Create a message
 *   basecamp_list_people    -- List people in the account
 *   basecamp_get_person     -- Get a single person
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function getAccountId(): string {
  const id = process.env.BASECAMP_ACCOUNT_ID || ''
  if (!id) {
    throw new Error(
      'BASECAMP_ACCOUNT_ID not configured. Set it to your Basecamp account ID.',
    )
  }
  return id
}

function getBaseUrl(): string {
  return `https://3.basecampapi.com/${getAccountId()}`
}

function makeClient() {
  return createApiClient({
    name: 'basecamp',
    baseUrl: getBaseUrl(),
    tokenEnvVar: 'BASECAMP_TOKEN',
    authStyle: 'bearer',
    defaultHeaders: {
      'User-Agent': 'MCPGate (mcpgate@example.com)',
    },
  })
}

async function basecampApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const { call } = makeClient()
  return call(path, opts)
}

function getCategoriseError() {
  return makeClient().categoriseError
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'basecamp-mcp',
  version: '0.1.0',
})

// ---- basecamp_list_projects -----------------------------------------------

server.tool(
  'basecamp_list_projects',
  'List all projects in the Basecamp account. Returns project names, IDs, purposes, and dock information.',
  {
    status: z
      .enum(['active', 'archived', 'trashed'])
      .optional()
      .describe('Filter by project status (default: active)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ status, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (status !== undefined) query.status = status
      if (page !== undefined) query.page = String(page)

      const result = await basecampApi('/projects.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_get_project -------------------------------------------------

server.tool(
  'basecamp_get_project',
  'Get details of a single Basecamp project by ID. Returns project info including dock (tools) configuration.',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
  },
  async ({ project_id }) => {
    try {
      const result = await basecampApi(`/projects/${project_id}.json`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_create_project ----------------------------------------------

server.tool(
  'basecamp_create_project',
  'Create a new Basecamp project. Returns the created project object.',
  {
    name: z.string().describe('Project name'),
    description: z
      .string()
      .optional()
      .describe('Project description (supports HTML)'),
  },
  async ({ name, description }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (description !== undefined) body.description = description

      const result = await basecampApi('/projects.json', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_list_todolists ----------------------------------------------

server.tool(
  'basecamp_list_todolists',
  'List to-do lists in a Basecamp project. Requires the project ID and the todoset ID (from the project dock).',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
    todoset_id: z.number().int().describe('The todoset ID from the project dock'),
    status: z
      .enum(['active', 'archived', 'trashed'])
      .optional()
      .describe('Filter by status (default: active)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ project_id, todoset_id, status, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (status !== undefined) query.status = status
      if (page !== undefined) query.page = String(page)

      const result = await basecampApi(
        `/buckets/${project_id}/todosets/${todoset_id}/todolists.json`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_create_todolist ---------------------------------------------

server.tool(
  'basecamp_create_todolist',
  'Create a new to-do list in a Basecamp project. Returns the created to-do list object.',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
    todoset_id: z.number().int().describe('The todoset ID from the project dock'),
    name: z.string().describe('Name of the to-do list'),
    description: z
      .string()
      .optional()
      .describe('Description of the to-do list (supports HTML)'),
  },
  async ({ project_id, todoset_id, name, description }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (description !== undefined) body.description = description

      const result = await basecampApi(
        `/buckets/${project_id}/todosets/${todoset_id}/todolists.json`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_create_todo -------------------------------------------------

server.tool(
  'basecamp_create_todo',
  'Create a new to-do item in a to-do list. Returns the created to-do object.',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
    todolist_id: z.number().int().describe('The to-do list ID to add the to-do to'),
    content: z.string().describe('To-do item content text'),
    description: z
      .string()
      .optional()
      .describe('To-do item description/notes (supports HTML)'),
    assignee_ids: z
      .array(z.number().int())
      .optional()
      .describe('Array of people IDs to assign this to-do to'),
    due_on: z
      .string()
      .optional()
      .describe('Due date in YYYY-MM-DD format'),
    starts_on: z
      .string()
      .optional()
      .describe('Start date in YYYY-MM-DD format'),
    notify: z
      .boolean()
      .optional()
      .describe('Whether to notify assignees (default true)'),
  },
  async ({ project_id, todolist_id, content, description, assignee_ids, due_on, starts_on, notify }) => {
    try {
      const body: Record<string, unknown> = { content }
      if (description !== undefined) body.description = description
      if (assignee_ids !== undefined) body.assignee_ids = assignee_ids
      if (due_on !== undefined) body.due_on = due_on
      if (starts_on !== undefined) body.starts_on = starts_on
      if (notify !== undefined) body.notify = notify

      const result = await basecampApi(
        `/buckets/${project_id}/todolists/${todolist_id}/todos.json`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_list_messages -----------------------------------------------

server.tool(
  'basecamp_list_messages',
  'List messages (Campfire or Message Board) in a Basecamp project. Requires the project ID and message board ID.',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
    message_board_id: z.number().int().describe('The message board ID from the project dock'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ project_id, message_board_id, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)

      const result = await basecampApi(
        `/buckets/${project_id}/message_boards/${message_board_id}/messages.json`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_create_message ----------------------------------------------

server.tool(
  'basecamp_create_message',
  'Create a new message on a Basecamp message board. Returns the created message object.',
  {
    project_id: z.number().int().describe('The Basecamp project ID'),
    message_board_id: z.number().int().describe('The message board ID from the project dock'),
    subject: z.string().describe('Message subject line'),
    content: z
      .string()
      .optional()
      .describe('Message body content (supports HTML)'),
    status: z
      .enum(['active', 'drafted'])
      .optional()
      .describe('Message status (default: active)'),
    category_id: z
      .number()
      .int()
      .optional()
      .describe('Message category/type ID'),
  },
  async ({ project_id, message_board_id, subject, content, status, category_id }) => {
    try {
      const body: Record<string, unknown> = { subject }
      if (content !== undefined) body.content = content
      if (status !== undefined) body.status = status
      if (category_id !== undefined) body.category_id = category_id

      const result = await basecampApi(
        `/buckets/${project_id}/message_boards/${message_board_id}/messages.json`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_list_people -------------------------------------------------

server.tool(
  'basecamp_list_people',
  'List all people in the Basecamp account. Returns names, email addresses, and avatar URLs.',
  {
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)

      const result = await basecampApi('/people.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- basecamp_get_person --------------------------------------------------

server.tool(
  'basecamp_get_person',
  'Get details of a single person by ID. Returns name, email, company, and other profile information.',
  {
    person_id: z.number().int().describe('The Basecamp person ID'),
  },
  async ({ person_id }) => {
    try {
      const result = await basecampApi(`/people/${person_id}.json`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

export default server
