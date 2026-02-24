/**
 * Asana MCP Server -- Production-ready
 *
 * Provides tools to interact with the Asana REST API on behalf of the
 * authenticated user.  Credentials are injected via the ASANA_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   asana_create_task      -- Create a new task in a project
 *   asana_get_task         -- Retrieve a task by GID
 *   asana_update_task      -- Update fields on a task
 *   asana_list_tasks       -- List tasks in a project
 *   asana_search_tasks     -- Search tasks in a workspace
 *   asana_create_project   -- Create a new project in a workspace
 *   asana_list_projects    -- List projects in a workspace
 *   asana_create_section   -- Create a section in a project
 *   asana_list_sections    -- List sections in a project
 *   asana_add_comment      -- Add a comment (story) to a task
 *   asana_list_comments    -- List comments (stories) on a task
 *   asana_assign_task      -- Assign a task to a user
 *   asana_complete_task    -- Mark a task as completed
 *   asana_list_workspaces  -- List workspaces for the authenticated user
 *   asana_list_tags        -- List tags in a workspace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'asana',
  baseUrl: 'https://app.asana.com/api/1.0',
  tokenEnvVar: 'ASANA_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'asana-mcp',
  version: '0.1.0',
})

// ---- asana_create_task ----------------------------------------------------

server.tool(
  'asana_create_task',
  'Create a new task in Asana. You can assign it to a project, set a due date, assign it to a user, and more. Returns the created task object.',
  {
    workspace_gid: z.string().describe('The GID of the workspace to create the task in'),
    name: z.string().describe('Name / title of the task'),
    notes: z.string().optional().describe('Free-form text notes / description for the task'),
    assignee: z.string().optional().describe('GID of the user to assign this task to, or "me" for the authenticated user'),
    projects: z.array(z.string()).optional().describe('Array of project GIDs to add this task to'),
    due_on: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    due_at: z.string().optional().describe('Due date and time in ISO 8601 format (e.g. 2025-01-15T12:00:00.000Z)'),
    tags: z.array(z.string()).optional().describe('Array of tag GIDs to apply to this task'),
    parent: z.string().optional().describe('GID of a parent task to create this as a subtask of'),
  },
  async ({ workspace_gid, name, notes, assignee, projects, due_on, due_at, tags, parent }) => {
    try {
      const data: Record<string, unknown> = { workspace: workspace_gid, name }
      if (notes !== undefined) data.notes = notes
      if (assignee !== undefined) data.assignee = assignee
      if (projects !== undefined) data.projects = projects
      if (due_on !== undefined) data.due_on = due_on
      if (due_at !== undefined) data.due_at = due_at
      if (tags !== undefined) data.tags = tags
      if (parent !== undefined) data.parent = parent

      const result = await call('/tasks', { method: 'POST', body: { data } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_get_task -------------------------------------------------------

server.tool(
  'asana_get_task',
  'Retrieve a single Asana task by its GID. Returns the full task object including name, notes, assignee, due date, and completion status.',
  {
    task_gid: z.string().describe('The GID of the task to retrieve'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "name,notes,assignee,due_on,completed,projects,tags")'),
  },
  async ({ task_gid, opt_fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (opt_fields !== undefined) query.opt_fields = opt_fields

      const result = await call(`/tasks/${task_gid}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_update_task ----------------------------------------------------

server.tool(
  'asana_update_task',
  'Update fields on an existing Asana task. Only provided fields are changed. Returns the updated task object.',
  {
    task_gid: z.string().describe('The GID of the task to update'),
    name: z.string().optional().describe('New name / title for the task'),
    notes: z.string().optional().describe('Updated free-form text notes / description'),
    due_on: z.string().optional().describe('Due date in YYYY-MM-DD format, or null to clear'),
    due_at: z.string().optional().describe('Due date and time in ISO 8601 format, or null to clear'),
    completed: z.boolean().optional().describe('Set to true to mark as complete, false to reopen'),
    assignee: z.string().optional().describe('GID of the user to assign to, "me", or null to unassign'),
  },
  async ({ task_gid, name, notes, due_on, due_at, completed, assignee }) => {
    try {
      const data: Record<string, unknown> = {}
      if (name !== undefined) data.name = name
      if (notes !== undefined) data.notes = notes
      if (due_on !== undefined) data.due_on = due_on
      if (due_at !== undefined) data.due_at = due_at
      if (completed !== undefined) data.completed = completed
      if (assignee !== undefined) data.assignee = assignee

      const result = await call(`/tasks/${task_gid}`, { method: 'PUT', body: { data } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_tasks -----------------------------------------------------

server.tool(
  'asana_list_tasks',
  'List tasks in an Asana project. Returns a paginated list of task objects. Requires a project GID.',
  {
    project_gid: z.string().describe('The GID of the project to list tasks from'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "name,assignee,due_on,completed")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100, default 20)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  },
  async ({ project_gid, opt_fields, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {
        project: project_gid,
      }
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = offset

      const result = await call('/tasks', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_search_tasks ---------------------------------------------------

server.tool(
  'asana_search_tasks',
  'Search tasks in an Asana workspace using various filters. Uses the /workspaces/{workspace_gid}/tasks/search endpoint. Returns matching tasks.',
  {
    workspace_gid: z.string().describe('The GID of the workspace to search in'),
    text: z.string().optional().describe('Free-text search string to match against task names and notes'),
    assignee_any: z.string().optional().describe('Comma-separated user GIDs to filter by assignee (any match)'),
    projects_any: z.string().optional().describe('Comma-separated project GIDs to filter by project (any match)'),
    completed: z.boolean().optional().describe('Filter by completion status: true for completed, false for incomplete'),
    is_subtask: z.boolean().optional().describe('Filter for subtasks (true) or top-level tasks (false)'),
    due_on_before: z.string().optional().describe('Filter for tasks due on or before this date (YYYY-MM-DD)'),
    due_on_after: z.string().optional().describe('Filter for tasks due on or after this date (YYYY-MM-DD)'),
    sort_by: z.enum(['due_date', 'created_at', 'completed_at', 'likes', 'modified_at']).optional().describe('Field to sort results by'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include'),
  },
  async ({ workspace_gid, text, assignee_any, projects_any, completed, is_subtask, due_on_before, due_on_after, sort_by, opt_fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (text !== undefined) query.text = text
      if (assignee_any !== undefined) query['assignee.any'] = assignee_any
      if (projects_any !== undefined) query['projects.any'] = projects_any
      if (completed !== undefined) query.completed = String(completed)
      if (is_subtask !== undefined) query.is_subtask = String(is_subtask)
      if (due_on_before !== undefined) query['due_on.before'] = due_on_before
      if (due_on_after !== undefined) query['due_on.after'] = due_on_after
      if (sort_by !== undefined) query.sort_by = sort_by
      if (opt_fields !== undefined) query.opt_fields = opt_fields

      const result = await call(`/workspaces/${workspace_gid}/tasks/search`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_create_project -------------------------------------------------

server.tool(
  'asana_create_project',
  'Create a new project in an Asana workspace. Returns the created project object.',
  {
    workspace_gid: z.string().describe('The GID of the workspace to create the project in'),
    name: z.string().describe('Name of the project'),
    notes: z.string().optional().describe('Free-form text notes / description for the project'),
    color: z.string().optional().describe('Colour of the project (e.g. "dark-green", "dark-blue", "dark-red")'),
    layout: z.enum(['board', 'list', 'timeline', 'calendar']).optional().describe('Layout style for the project (default: list)'),
    default_view: z.enum(['list', 'board', 'calendar', 'timeline']).optional().describe('Default view when opening the project'),
  },
  async ({ workspace_gid, name, notes, color, layout, default_view }) => {
    try {
      const data: Record<string, unknown> = { workspace: workspace_gid, name }
      if (notes !== undefined) data.notes = notes
      if (color !== undefined) data.color = color
      if (layout !== undefined) data.layout = layout
      if (default_view !== undefined) data.default_view = default_view

      const result = await call('/projects', { method: 'POST', body: { data } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_projects --------------------------------------------------

server.tool(
  'asana_list_projects',
  'List projects in an Asana workspace. Returns a paginated list of project objects. Requires a workspace GID.',
  {
    workspace_gid: z.string().describe('The GID of the workspace to list projects from'),
    archived: z.boolean().optional().describe('Filter by archived status (true = archived only, false = active only)'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "name,notes,color,created_at")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100, default 20)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  },
  async ({ workspace_gid, archived, opt_fields, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {
        workspace: workspace_gid,
      }
      if (archived !== undefined) query.archived = String(archived)
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = offset

      const result = await call('/projects', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_create_section -------------------------------------------------

server.tool(
  'asana_create_section',
  'Create a new section in an Asana project. Sections organise tasks within a project. Returns the created section object.',
  {
    project_gid: z.string().describe('The GID of the project to create the section in'),
    name: z.string().describe('Name of the section'),
  },
  async ({ project_gid, name }) => {
    try {
      const result = await call(`/projects/${project_gid}/sections`, {
        method: 'POST',
        body: { data: { name } },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_sections --------------------------------------------------

server.tool(
  'asana_list_sections',
  'List sections in an Asana project. Returns all sections in order.',
  {
    project_gid: z.string().describe('The GID of the project to list sections from'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  },
  async ({ project_gid, opt_fields, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = offset

      const result = await call(`/projects/${project_gid}/sections`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_add_comment ----------------------------------------------------

server.tool(
  'asana_add_comment',
  'Add a comment (story) to an Asana task. Comments appear in the task conversation. Returns the created story object.',
  {
    task_gid: z.string().describe('The GID of the task to comment on'),
    text: z.string().describe('Plain-text body of the comment'),
    is_pinned: z.boolean().optional().describe('Whether to pin this comment to the top of the task conversation'),
  },
  async ({ task_gid, text, is_pinned }) => {
    try {
      const data: Record<string, unknown> = { text }
      if (is_pinned !== undefined) data.is_pinned = is_pinned

      const result = await call(`/tasks/${task_gid}/stories`, {
        method: 'POST',
        body: { data },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_comments --------------------------------------------------

server.tool(
  'asana_list_comments',
  'List comments (stories) on an Asana task. Returns the conversation history for the task.',
  {
    task_gid: z.string().describe('The GID of the task to retrieve comments for'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "text,created_by,created_at,type")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  },
  async ({ task_gid, opt_fields, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = offset

      const result = await call(`/tasks/${task_gid}/stories`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_assign_task ----------------------------------------------------

server.tool(
  'asana_assign_task',
  'Assign an Asana task to a user. Pass a user GID, "me" for the authenticated user, or null to unassign. Returns the updated task.',
  {
    task_gid: z.string().describe('The GID of the task to assign'),
    assignee: z.string().describe('GID of the user to assign to, "me" for the authenticated user, or "null" to unassign'),
  },
  async ({ task_gid, assignee }) => {
    try {
      const data: Record<string, unknown> = {
        assignee: assignee === 'null' ? null : assignee,
      }

      const result = await call(`/tasks/${task_gid}`, { method: 'PUT', body: { data } })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_complete_task --------------------------------------------------

server.tool(
  'asana_complete_task',
  'Mark an Asana task as completed. Returns the updated task object with completed set to true.',
  {
    task_gid: z.string().describe('The GID of the task to mark as completed'),
  },
  async ({ task_gid }) => {
    try {
      const result = await call(`/tasks/${task_gid}`, {
        method: 'PUT',
        body: { data: { completed: true } },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_workspaces ------------------------------------------------

server.tool(
  'asana_list_workspaces',
  'List workspaces accessible to the authenticated Asana user. Returns workspace GIDs and names.',
  {
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "name,is_organization")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100)'),
  },
  async ({ opt_fields, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)

      const result = await call('/workspaces', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- asana_list_tags ------------------------------------------------------

server.tool(
  'asana_list_tags',
  'List tags in an Asana workspace. Returns tag GIDs and names.',
  {
    workspace_gid: z.string().describe('The GID of the workspace to list tags from'),
    opt_fields: z.string().optional().describe('Comma-separated list of optional fields to include (e.g. "name,color")'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results per page (1-100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  },
  async ({ workspace_gid, opt_fields, limit, offset }) => {
    try {
      const query: Record<string, string | undefined> = {
        workspace: workspace_gid,
      }
      if (opt_fields !== undefined) query.opt_fields = opt_fields
      if (limit !== undefined) query.limit = String(limit)
      if (offset !== undefined) query.offset = offset

      const result = await call('/tags', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
