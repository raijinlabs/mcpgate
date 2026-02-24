/**
 * Typeform MCP Server -- Production-ready
 *
 * Provides tools to interact with the Typeform REST API on behalf of the
 * authenticated user.  Credentials are injected via the TYPEFORM_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   typeform_list_forms      -- List forms
 *   typeform_get_form        -- Get a single form
 *   typeform_create_form     -- Create a new form
 *   typeform_update_form     -- Update a form
 *   typeform_delete_form     -- Delete a form
 *   typeform_list_responses  -- List form responses
 *   typeform_get_insights    -- Get form insights/analytics
 *   typeform_list_workspaces -- List workspaces
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'typeform',
  baseUrl: 'https://api.typeform.com',
  tokenEnvVar: 'TYPEFORM_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'typeform-mcp',
  version: '0.1.0',
})

// ---- typeform_list_forms --------------------------------------------------

server.tool(
  'typeform_list_forms',
  'List forms in the Typeform account. Results are paginated and can be filtered by workspace.',
  {
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of forms per page (1-200, default 10)'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter forms by title'),
    workspace_id: z
      .string()
      .optional()
      .describe('Filter forms by workspace ID'),
  },
  async ({ page, page_size, search, workspace_id }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      if (search !== undefined) query.search = search
      if (workspace_id !== undefined) query.workspace_id = workspace_id

      const result = await call('/forms', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_get_form ----------------------------------------------------

server.tool(
  'typeform_get_form',
  'Get details of a single Typeform form by ID. Returns form definition including fields, logic, and settings.',
  {
    form_id: z.string().describe('The Typeform form ID'),
  },
  async ({ form_id }) => {
    try {
      const result = await call(`/forms/${form_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_create_form -------------------------------------------------

server.tool(
  'typeform_create_form',
  'Create a new Typeform form. Returns the created form object with its ID and URL.',
  {
    title: z.string().describe('Form title'),
    fields: z
      .array(
        z.object({
          title: z.string().describe('Field question text'),
          type: z
            .enum([
              'short_text', 'long_text', 'email', 'number', 'yes_no',
              'multiple_choice', 'dropdown', 'opinion_scale', 'rating',
              'date', 'file_upload', 'legal', 'website', 'phone_number',
              'picture_choice', 'ranking', 'matrix', 'nps', 'statement',
              'group', 'payment', 'calendly',
            ])
            .describe('Field type'),
          ref: z.string().optional().describe('Custom reference ID for the field'),
          required: z.boolean().optional().describe('Whether the field is required'),
          properties: z
            .record(z.unknown())
            .optional()
            .describe('Type-specific field properties (choices, labels, etc.)'),
        }),
      )
      .optional()
      .describe('Array of form field definitions'),
    workspace: z
      .object({
        href: z.string().describe('Workspace URL reference'),
      })
      .optional()
      .describe('Workspace to create the form in'),
    settings: z
      .record(z.unknown())
      .optional()
      .describe('Form settings (language, progress_bar, meta, notifications, etc.)'),
    theme: z
      .object({
        href: z.string().describe('Theme URL reference'),
      })
      .optional()
      .describe('Theme to apply to the form'),
  },
  async ({ title, fields, workspace, settings, theme }) => {
    try {
      const body: Record<string, unknown> = { title }
      if (fields !== undefined) body.fields = fields
      if (workspace !== undefined) body.workspace = workspace
      if (settings !== undefined) body.settings = settings
      if (theme !== undefined) body.theme = theme

      const result = await call('/forms', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_update_form -------------------------------------------------

server.tool(
  'typeform_update_form',
  'Update an existing Typeform form. Uses PUT to replace the form definition. Returns the updated form.',
  {
    form_id: z.string().describe('The Typeform form ID to update'),
    title: z.string().optional().describe('New form title'),
    fields: z
      .array(
        z.object({
          title: z.string().describe('Field question text'),
          type: z
            .enum([
              'short_text', 'long_text', 'email', 'number', 'yes_no',
              'multiple_choice', 'dropdown', 'opinion_scale', 'rating',
              'date', 'file_upload', 'legal', 'website', 'phone_number',
              'picture_choice', 'ranking', 'matrix', 'nps', 'statement',
              'group', 'payment', 'calendly',
            ])
            .describe('Field type'),
          ref: z.string().optional().describe('Custom reference ID for the field'),
          required: z.boolean().optional().describe('Whether the field is required'),
          properties: z
            .record(z.unknown())
            .optional()
            .describe('Type-specific field properties'),
        }),
      )
      .optional()
      .describe('Replacement array of form field definitions'),
    settings: z
      .record(z.unknown())
      .optional()
      .describe('Replacement form settings'),
  },
  async ({ form_id, title, fields, settings }) => {
    try {
      const body: Record<string, unknown> = {}
      if (title !== undefined) body.title = title
      if (fields !== undefined) body.fields = fields
      if (settings !== undefined) body.settings = settings

      const result = await call(`/forms/${form_id}`, {
        method: 'PUT',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_delete_form -------------------------------------------------

server.tool(
  'typeform_delete_form',
  'Delete a Typeform form by ID. This action is irreversible. Returns empty on success.',
  {
    form_id: z.string().describe('The Typeform form ID to delete'),
  },
  async ({ form_id }) => {
    try {
      const result = await call(`/forms/${form_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_list_responses ----------------------------------------------

server.tool(
  'typeform_list_responses',
  'List responses for a Typeform form. Results are paginated and can be filtered by date or completion status.',
  {
    form_id: z.string().describe('The Typeform form ID to get responses for'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of responses per page (1-1000, default 25)'),
    since: z
      .string()
      .optional()
      .describe('Filter responses submitted after this date (ISO 8601 format)'),
    until: z
      .string()
      .optional()
      .describe('Filter responses submitted before this date (ISO 8601 format)'),
    after: z
      .string()
      .optional()
      .describe('Pagination cursor -- response token to start after'),
    before: z
      .string()
      .optional()
      .describe('Pagination cursor -- response token to end before'),
    completed: z
      .boolean()
      .optional()
      .describe('Filter by completion status (true=completed, false=partial)'),
    sort: z
      .enum(['submitted_at,asc', 'submitted_at,desc'])
      .optional()
      .describe('Sort order for responses'),
    query: z
      .string()
      .optional()
      .describe('Search query to filter responses by answer content'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated field IDs to include in the response'),
  },
  async ({ form_id, page_size, since, until, after, before, completed, sort, query, fields }) => {
    try {
      const q: Record<string, string | undefined> = {}
      if (page_size !== undefined) q.page_size = String(page_size)
      if (since !== undefined) q.since = since
      if (until !== undefined) q.until = until
      if (after !== undefined) q.after = after
      if (before !== undefined) q.before = before
      if (completed !== undefined) q.completed = String(completed)
      if (sort !== undefined) q.sort = sort
      if (query !== undefined) q.query = query
      if (fields !== undefined) q.fields = fields

      const result = await call(`/forms/${form_id}/responses`, { query: q })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_get_insights ------------------------------------------------

server.tool(
  'typeform_get_insights',
  'Get insights and analytics for a Typeform form. Returns response metrics, completion rates, and field-level statistics.',
  {
    form_id: z.string().describe('The Typeform form ID to get insights for'),
  },
  async ({ form_id }) => {
    try {
      const result = await call(`/forms/${form_id}/insights`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- typeform_list_workspaces ---------------------------------------------

server.tool(
  'typeform_list_workspaces',
  'List workspaces in the Typeform account. Returns workspace names, IDs, and member counts.',
  {
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Number of workspaces per page (1-200, default 10)'),
    search: z
      .string()
      .optional()
      .describe('Search query to filter workspaces by name'),
  },
  async ({ page, page_size, search }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (page_size !== undefined) query.page_size = String(page_size)
      if (search !== undefined) query.search = search

      const result = await call('/workspaces', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
