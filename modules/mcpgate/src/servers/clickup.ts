/**
 * ClickUp MCP Server -- Production-ready
 *
 * Provides tools to interact with the ClickUp REST API v2 on behalf of the
 * authenticated user.  Credentials are injected via the CLICKUP_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   clickup_create_task   -- Create a new task in a list
 *   clickup_get_task      -- Retrieve a task by ID
 *   clickup_update_task   -- Update fields on a task
 *   clickup_list_tasks    -- List tasks in a list
 *   clickup_create_list   -- Create a new list in a folder
 *   clickup_list_lists    -- List all lists in a folder
 *   clickup_create_space  -- Create a new space in a team
 *   clickup_list_spaces   -- List spaces in a team
 *   clickup_list_folders  -- List folders in a space
 *   clickup_add_comment   -- Add a comment to a task
 *   clickup_assign_task   -- Assign users to a task
 *   clickup_set_priority  -- Set the priority of a task
 *   clickup_add_tag       -- Add a tag to a task
 *   clickup_list_teams    -- List accessible teams (workspaces)
 *   clickup_list_members  -- List members of a list
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'clickup',
  baseUrl: 'https://api.clickup.com/api/v2',
  tokenEnvVar: 'CLICKUP_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'clickup-mcp',
  version: '0.1.0',
})

// ---- clickup_create_task --------------------------------------------------

server.tool(
  'clickup_create_task',
  'Create a new task in a ClickUp list. Returns the created task object with its ID and URL.',
  {
    list_id: z.string().describe('The ID of the list to create the task in'),
    name: z.string().describe('Name / title of the task'),
    description: z.string().optional().describe('Task description in Markdown format'),
    assignees: z.array(z.number()).optional().describe('Array of user IDs (integers) to assign to this task'),
    status: z.string().optional().describe('Status name for the task (must match a status in the list, e.g. "to do", "in progress")'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority level: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low'),
    due_date: z.number().optional().describe('Due date as Unix timestamp in milliseconds'),
    start_date: z.number().optional().describe('Start date as Unix timestamp in milliseconds'),
    tags: z.array(z.string()).optional().describe('Array of tag names to apply to this task'),
    parent: z.string().optional().describe('Task ID of the parent task to create this as a subtask of'),
  },
  async ({ list_id, name, description, assignees, status, priority, due_date, start_date, tags, parent }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (description !== undefined) body.description = description
      if (assignees !== undefined) body.assignees = assignees
      if (status !== undefined) body.status = status
      if (priority !== undefined) body.priority = priority
      if (due_date !== undefined) body.due_date = due_date
      if (start_date !== undefined) body.start_date = start_date
      if (tags !== undefined) body.tags = tags
      if (parent !== undefined) body.parent = parent

      const result = await call(`/list/${list_id}/task`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_get_task -----------------------------------------------------

server.tool(
  'clickup_get_task',
  'Retrieve a single ClickUp task by its ID. Returns the full task object including name, description, status, assignees, and dates.',
  {
    task_id: z.string().describe('The ID of the task to retrieve'),
    include_subtasks: z.boolean().optional().describe('Whether to include subtasks in the response (default: false)'),
  },
  async ({ task_id, include_subtasks }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (include_subtasks !== undefined) query.include_subtasks = String(include_subtasks)

      const result = await call(`/task/${task_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_update_task --------------------------------------------------

server.tool(
  'clickup_update_task',
  'Update fields on an existing ClickUp task. Only provided fields are changed. Returns the updated task object.',
  {
    task_id: z.string().describe('The ID of the task to update'),
    name: z.string().optional().describe('New name / title for the task'),
    description: z.string().optional().describe('Updated description in Markdown'),
    status: z.string().optional().describe('New status name (must match a status in the list)'),
    priority: z.number().int().min(1).max(4).optional().describe('Priority level: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low'),
    due_date: z.number().optional().describe('Due date as Unix timestamp in milliseconds, or null to clear'),
    start_date: z.number().optional().describe('Start date as Unix timestamp in milliseconds, or null to clear'),
    assignees_add: z.array(z.number()).optional().describe('Array of user IDs (integers) to add as assignees'),
    assignees_rem: z.array(z.number()).optional().describe('Array of user IDs (integers) to remove from assignees'),
    archived: z.boolean().optional().describe('Set to true to archive the task'),
  },
  async ({ task_id, name, description, status, priority, due_date, start_date, assignees_add, assignees_rem, archived }) => {
    try {
      const body: Record<string, unknown> = {}
      if (name !== undefined) body.name = name
      if (description !== undefined) body.description = description
      if (status !== undefined) body.status = status
      if (priority !== undefined) body.priority = priority
      if (due_date !== undefined) body.due_date = due_date
      if (start_date !== undefined) body.start_date = start_date
      if (assignees_add !== undefined || assignees_rem !== undefined) {
        body.assignees = {
          add: assignees_add ?? [],
          rem: assignees_rem ?? [],
        }
      }
      if (archived !== undefined) body.archived = archived

      const result = await call(`/task/${task_id}`, { method: 'PUT', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_tasks ---------------------------------------------------

server.tool(
  'clickup_list_tasks',
  'List tasks in a ClickUp list. Returns a paginated array of task objects.',
  {
    list_id: z.string().describe('The ID of the list to retrieve tasks from'),
    archived: z.boolean().optional().describe('Include archived tasks (default: false)'),
    page: z.number().int().min(0).optional().describe('Page number for pagination (0-indexed, default 0)'),
    order_by: z.enum(['id', 'created', 'updated', 'due_date']).optional().describe('Field to order results by'),
    reverse: z.boolean().optional().describe('Reverse the order of results'),
    subtasks: z.boolean().optional().describe('Include subtasks (default: false)'),
    statuses: z.array(z.string()).optional().describe('Array of status names to filter by'),
    include_closed: z.boolean().optional().describe('Include closed tasks (default: false)'),
    assignees: z.array(z.string()).optional().describe('Array of assignee user IDs to filter by'),
    due_date_gt: z.number().optional().describe('Filter tasks with due date greater than this Unix timestamp (ms)'),
    due_date_lt: z.number().optional().describe('Filter tasks with due date less than this Unix timestamp (ms)'),
  },
  async ({ list_id, archived, page, order_by, reverse, subtasks, statuses, include_closed, assignees, due_date_gt, due_date_lt }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (archived !== undefined) query.archived = String(archived)
      if (page !== undefined) query.page = String(page)
      if (order_by !== undefined) query.order_by = order_by
      if (reverse !== undefined) query.reverse = String(reverse)
      if (subtasks !== undefined) query.subtasks = String(subtasks)
      if (statuses !== undefined) {
        statuses.forEach((s, i) => { query[`statuses[]`] = undefined; query[`statuses[${i}]`] = s })
      }
      if (include_closed !== undefined) query.include_closed = String(include_closed)
      if (assignees !== undefined) {
        assignees.forEach((a, i) => { query[`assignees[${i}]`] = a })
      }
      if (due_date_gt !== undefined) query.due_date_gt = String(due_date_gt)
      if (due_date_lt !== undefined) query.due_date_lt = String(due_date_lt)

      const result = await call(`/list/${list_id}/task`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_create_list --------------------------------------------------

server.tool(
  'clickup_create_list',
  'Create a new list in a ClickUp folder. Returns the created list object.',
  {
    folder_id: z.string().describe('The ID of the folder to create the list in'),
    name: z.string().describe('Name of the new list'),
    content: z.string().optional().describe('Description / content for the list'),
    due_date: z.number().optional().describe('Due date for the list as Unix timestamp in milliseconds'),
    priority: z.number().int().min(1).max(4).optional().describe('Default priority: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low'),
    assignee: z.number().optional().describe('User ID (integer) to set as default assignee'),
    status: z.string().optional().describe('Initial status for the list'),
  },
  async ({ folder_id, name, content, due_date, priority, assignee, status }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (content !== undefined) body.content = content
      if (due_date !== undefined) body.due_date = due_date
      if (priority !== undefined) body.priority = priority
      if (assignee !== undefined) body.assignee = assignee
      if (status !== undefined) body.status = status

      const result = await call(`/folder/${folder_id}/list`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_lists ---------------------------------------------------

server.tool(
  'clickup_list_lists',
  'List all lists in a ClickUp folder. Returns an array of list objects.',
  {
    folder_id: z.string().describe('The ID of the folder to list lists from'),
    archived: z.boolean().optional().describe('Include archived lists (default: false)'),
  },
  async ({ folder_id, archived }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (archived !== undefined) query.archived = String(archived)

      const result = await call(`/folder/${folder_id}/list`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_create_space -------------------------------------------------

server.tool(
  'clickup_create_space',
  'Create a new space in a ClickUp team (workspace). Returns the created space object.',
  {
    team_id: z.string().describe('The ID of the team (workspace) to create the space in'),
    name: z.string().describe('Name of the new space'),
    multiple_assignees: z.boolean().optional().describe('Whether tasks in this space can have multiple assignees (default: false)'),
    features: z.record(z.unknown()).optional().describe('Space feature toggles object (e.g. { due_dates: { enabled: true } })'),
  },
  async ({ team_id, name, multiple_assignees, features }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (multiple_assignees !== undefined) body.multiple_assignees = multiple_assignees
      if (features !== undefined) body.features = features

      const result = await call(`/team/${team_id}/space`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_spaces --------------------------------------------------

server.tool(
  'clickup_list_spaces',
  'List all spaces in a ClickUp team (workspace). Returns an array of space objects.',
  {
    team_id: z.string().describe('The ID of the team (workspace) to list spaces from'),
    archived: z.boolean().optional().describe('Include archived spaces (default: false)'),
  },
  async ({ team_id, archived }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (archived !== undefined) query.archived = String(archived)

      const result = await call(`/team/${team_id}/space`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_folders -------------------------------------------------

server.tool(
  'clickup_list_folders',
  'List all folders in a ClickUp space. Returns an array of folder objects.',
  {
    space_id: z.string().describe('The ID of the space to list folders from'),
    archived: z.boolean().optional().describe('Include archived folders (default: false)'),
  },
  async ({ space_id, archived }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (archived !== undefined) query.archived = String(archived)

      const result = await call(`/space/${space_id}/folder`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_add_comment --------------------------------------------------

server.tool(
  'clickup_add_comment',
  'Add a comment to a ClickUp task. Returns the created comment object.',
  {
    task_id: z.string().describe('The ID of the task to comment on'),
    comment_text: z.string().describe('Plain-text body of the comment'),
    assignee: z.number().optional().describe('User ID (integer) to assign this comment to (for action items)'),
    notify_all: z.boolean().optional().describe('Whether to notify all task watchers (default: false)'),
  },
  async ({ task_id, comment_text, assignee, notify_all }) => {
    try {
      const body: Record<string, unknown> = { comment_text }
      if (assignee !== undefined) body.assignee = assignee
      if (notify_all !== undefined) body.notify_all = notify_all

      const result = await call(`/task/${task_id}/comment`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_assign_task --------------------------------------------------

server.tool(
  'clickup_assign_task',
  'Assign or reassign users to a ClickUp task. Specify user IDs to add and/or remove. Returns the updated task object.',
  {
    task_id: z.string().describe('The ID of the task to modify assignees on'),
    assignees_add: z.array(z.number()).optional().describe('Array of user IDs (integers) to add as assignees'),
    assignees_rem: z.array(z.number()).optional().describe('Array of user IDs (integers) to remove from assignees'),
  },
  async ({ task_id, assignees_add, assignees_rem }) => {
    try {
      const body: Record<string, unknown> = {
        assignees: {
          add: assignees_add ?? [],
          rem: assignees_rem ?? [],
        },
      }

      const result = await call(`/task/${task_id}`, { method: 'PUT', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_set_priority -------------------------------------------------

server.tool(
  'clickup_set_priority',
  'Set the priority of a ClickUp task. Returns the updated task object.',
  {
    task_id: z.string().describe('The ID of the task to set priority on'),
    priority: z.number().int().min(1).max(4).describe('Priority level: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low'),
  },
  async ({ task_id, priority }) => {
    try {
      const result = await call(`/task/${task_id}`, {
        method: 'PUT',
        body: { priority },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_add_tag ------------------------------------------------------

server.tool(
  'clickup_add_tag',
  'Add a tag to a ClickUp task. The tag is created on the space if it does not already exist. Returns confirmation.',
  {
    task_id: z.string().describe('The ID of the task to add the tag to'),
    tag_name: z.string().describe('Name of the tag to add (case-insensitive)'),
  },
  async ({ task_id, tag_name }) => {
    try {
      const result = await call(`/task/${task_id}/tag/${encodeURIComponent(tag_name)}`, {
        method: 'POST',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_teams ---------------------------------------------------

server.tool(
  'clickup_list_teams',
  'List all accessible teams (workspaces) for the authenticated ClickUp user. Returns an array of team objects.',
  {},
  async () => {
    try {
      const result = await call('/team')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- clickup_list_members -------------------------------------------------

server.tool(
  'clickup_list_members',
  'List members of a ClickUp list. Returns an array of member (user) objects.',
  {
    list_id: z.string().describe('The ID of the list to list members from'),
  },
  async ({ list_id }) => {
    try {
      const result = await call(`/list/${list_id}/member`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
