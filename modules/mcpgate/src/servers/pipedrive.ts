/**
 * Pipedrive MCP Server -- Production-ready
 *
 * Provides tools to interact with the Pipedrive CRM API v1 on behalf of the
 * authenticated user.  Credentials are injected via the PIPEDRIVE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Pipedrive uses API token authentication via query parameter.
 *
 * Tools:
 *   pipedrive_create_deal         -- Create a new deal
 *   pipedrive_get_deal            -- Get a deal by ID
 *   pipedrive_update_deal         -- Update an existing deal
 *   pipedrive_list_deals          -- List deals with pagination
 *   pipedrive_search_deals        -- Search deals by keyword
 *   pipedrive_create_person       -- Create a new person
 *   pipedrive_list_persons        -- List persons with pagination
 *   pipedrive_create_organization -- Create a new organization
 *   pipedrive_list_organizations  -- List organizations with pagination
 *   pipedrive_create_activity     -- Create a new activity
 *   pipedrive_list_activities     -- List activities with filtering
 *   pipedrive_list_pipelines      -- List sales pipelines and stages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'pipedrive',
  baseUrl: 'https://api.pipedrive.com/v1',
  tokenEnvVar: 'PIPEDRIVE_TOKEN',
  authStyle: 'api-key-query',
  authHeader: 'api_token',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'pipedrive-mcp',
  version: '0.1.0',
})

// ---- pipedrive_create_deal ------------------------------------------------

server.tool(
  'pipedrive_create_deal',
  'Create a new deal in Pipedrive CRM. Returns the created deal including its ID and properties.',
  {
    title: z.string().describe('Title of the deal'),
    value: z.number().optional().describe('Monetary value of the deal'),
    currency: z
      .string()
      .optional()
      .describe('Currency code for the deal value (e.g. "USD", "EUR"). Defaults to the org default currency.'),
    person_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the person to associate with this deal'),
    org_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the organization to associate with this deal'),
    pipeline_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the pipeline to place the deal in. Use pipedrive_list_pipelines to find available pipelines.'),
    stage_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the stage within the pipeline. Use pipedrive_list_pipelines to find available stages.'),
    status: z
      .enum(['open', 'won', 'lost', 'deleted'])
      .optional()
      .describe('Deal status (default: open)'),
    expected_close_date: z
      .string()
      .optional()
      .describe('Expected close date in YYYY-MM-DD format'),
    visible_to: z
      .enum(['1', '3', '5', '7'])
      .optional()
      .describe('Visibility: 1=Owner only, 3=Owner group, 5=Owner group and sub-groups, 7=Entire company'),
  },
  async ({ title, value, currency, person_id, org_id, pipeline_id, stage_id, status, expected_close_date, visible_to }) => {
    try {
      const body: Record<string, unknown> = { title }
      if (value !== undefined) body.value = value
      if (currency !== undefined) body.currency = currency
      if (person_id !== undefined) body.person_id = person_id
      if (org_id !== undefined) body.org_id = org_id
      if (pipeline_id !== undefined) body.pipeline_id = pipeline_id
      if (stage_id !== undefined) body.stage_id = stage_id
      if (status !== undefined) body.status = status
      if (expected_close_date !== undefined) body.expected_close_date = expected_close_date
      if (visible_to !== undefined) body.visible_to = visible_to

      const result = await call('/deals', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_get_deal ---------------------------------------------------

server.tool(
  'pipedrive_get_deal',
  'Get a Pipedrive deal by its ID. Returns the deal properties, associated person, organization, and stage details.',
  {
    deal_id: z.number().int().describe('The Pipedrive deal ID'),
  },
  async ({ deal_id }) => {
    try {
      const result = await call(`/deals/${deal_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_update_deal ------------------------------------------------

server.tool(
  'pipedrive_update_deal',
  'Update an existing Pipedrive deal. Only provided fields are changed. Returns the updated deal.',
  {
    deal_id: z.number().int().describe('The Pipedrive deal ID to update'),
    title: z.string().optional().describe('New title for the deal'),
    value: z.number().optional().describe('New monetary value for the deal'),
    currency: z.string().optional().describe('New currency code'),
    person_id: z.number().int().optional().describe('New person ID to associate'),
    org_id: z.number().int().optional().describe('New organization ID to associate'),
    pipeline_id: z.number().int().optional().describe('New pipeline ID'),
    stage_id: z.number().int().optional().describe('New stage ID within the pipeline'),
    status: z
      .enum(['open', 'won', 'lost', 'deleted'])
      .optional()
      .describe('New deal status'),
    expected_close_date: z
      .string()
      .optional()
      .describe('New expected close date in YYYY-MM-DD format'),
    lost_reason: z
      .string()
      .optional()
      .describe('Reason for losing the deal (only relevant when status is "lost")'),
  },
  async ({ deal_id, title, value, currency, person_id, org_id, pipeline_id, stage_id, status, expected_close_date, lost_reason }) => {
    try {
      const body: Record<string, unknown> = {}
      if (title !== undefined) body.title = title
      if (value !== undefined) body.value = value
      if (currency !== undefined) body.currency = currency
      if (person_id !== undefined) body.person_id = person_id
      if (org_id !== undefined) body.org_id = org_id
      if (pipeline_id !== undefined) body.pipeline_id = pipeline_id
      if (stage_id !== undefined) body.stage_id = stage_id
      if (status !== undefined) body.status = status
      if (expected_close_date !== undefined) body.expected_close_date = expected_close_date
      if (lost_reason !== undefined) body.lost_reason = lost_reason

      const result = await call(`/deals/${deal_id}`, { method: 'PUT', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_list_deals -------------------------------------------------

server.tool(
  'pipedrive_list_deals',
  'List deals in Pipedrive CRM. Results are paginated. Can filter by user, stage, and status.',
  {
    user_id: z
      .number()
      .int()
      .optional()
      .describe('Filter deals by owner user ID'),
    stage_id: z
      .number()
      .int()
      .optional()
      .describe('Filter deals by stage ID'),
    status: z
      .enum(['open', 'won', 'lost', 'deleted', 'all_not_deleted'])
      .optional()
      .describe('Filter deals by status (default: all_not_deleted)'),
    start: z
      .number()
      .int()
      .optional()
      .describe('Pagination start offset (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of deals to return per page (1-500, default 100)'),
    sort: z
      .string()
      .optional()
      .describe('Sort field and direction (e.g. "add_time DESC", "value ASC")'),
  },
  async ({ user_id, stage_id, status, start, limit, sort }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (user_id !== undefined) query.user_id = String(user_id)
      if (stage_id !== undefined) query.stage_id = String(stage_id)
      if (status !== undefined) query.status = status
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (sort !== undefined) query.sort = sort

      const result = await call('/deals', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_search_deals -----------------------------------------------

server.tool(
  'pipedrive_search_deals',
  'Search for deals in Pipedrive by keyword. Returns matching deals with highlights.',
  {
    term: z.string().describe('Search term to match against deal titles and custom fields'),
    fields: z
      .enum(['custom_fields', 'notes', 'title'])
      .optional()
      .describe('Which fields to search in (default: searches all)'),
    exact_match: z
      .boolean()
      .optional()
      .describe('If true, only return exact matches (default: false)'),
    status: z
      .enum(['open', 'won', 'lost'])
      .optional()
      .describe('Filter results by deal status'),
    start: z
      .number()
      .int()
      .optional()
      .describe('Pagination start offset (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of results to return (1-500, default 100)'),
  },
  async ({ term, fields, exact_match, status, start, limit }) => {
    try {
      const query: Record<string, string | undefined> = { term }
      if (fields !== undefined) query.fields = fields
      if (exact_match !== undefined) query.exact_match = String(exact_match)
      if (status !== undefined) query.status = status
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)

      const result = await call('/deals/search', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_create_person ----------------------------------------------

server.tool(
  'pipedrive_create_person',
  'Create a new person (contact) in Pipedrive. Returns the created person including their ID.',
  {
    name: z.string().describe('Full name of the person'),
    email: z
      .array(z.string())
      .optional()
      .describe('Array of email addresses for the person'),
    phone: z
      .array(z.string())
      .optional()
      .describe('Array of phone numbers for the person'),
    org_id: z
      .number()
      .int()
      .optional()
      .describe('Organization ID to associate this person with'),
    visible_to: z
      .enum(['1', '3', '5', '7'])
      .optional()
      .describe('Visibility: 1=Owner only, 3=Owner group, 5=Owner group and sub-groups, 7=Entire company'),
  },
  async ({ name, email, phone, org_id, visible_to }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (email !== undefined) body.email = email.map((e) => ({ value: e, primary: false, label: 'work' }))
      if (phone !== undefined) body.phone = phone.map((p) => ({ value: p, primary: false, label: 'work' }))
      if (org_id !== undefined) body.org_id = org_id
      if (visible_to !== undefined) body.visible_to = visible_to

      // Mark first entries as primary
      if (body.email && Array.isArray(body.email) && body.email.length > 0) {
        (body.email as Array<Record<string, unknown>>)[0].primary = true
      }
      if (body.phone && Array.isArray(body.phone) && body.phone.length > 0) {
        (body.phone as Array<Record<string, unknown>>)[0].primary = true
      }

      const result = await call('/persons', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_list_persons -----------------------------------------------

server.tool(
  'pipedrive_list_persons',
  'List persons (contacts) in Pipedrive. Results are paginated.',
  {
    user_id: z
      .number()
      .int()
      .optional()
      .describe('Filter persons by owner user ID'),
    filter_id: z
      .number()
      .int()
      .optional()
      .describe('Filter ID for custom filtering'),
    start: z
      .number()
      .int()
      .optional()
      .describe('Pagination start offset (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of persons to return (1-500, default 100)'),
    sort: z
      .string()
      .optional()
      .describe('Sort field and direction (e.g. "name ASC", "add_time DESC")'),
  },
  async ({ user_id, filter_id, start, limit, sort }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (user_id !== undefined) query.user_id = String(user_id)
      if (filter_id !== undefined) query.filter_id = String(filter_id)
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (sort !== undefined) query.sort = sort

      const result = await call('/persons', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_create_organization ----------------------------------------

server.tool(
  'pipedrive_create_organization',
  'Create a new organization in Pipedrive. Returns the created organization including its ID.',
  {
    name: z.string().describe('Name of the organization'),
    owner_id: z
      .number()
      .int()
      .optional()
      .describe('User ID of the organization owner'),
    visible_to: z
      .enum(['1', '3', '5', '7'])
      .optional()
      .describe('Visibility: 1=Owner only, 3=Owner group, 5=Owner group and sub-groups, 7=Entire company'),
    address: z
      .string()
      .optional()
      .describe('Full address of the organization'),
  },
  async ({ name, owner_id, visible_to, address }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (owner_id !== undefined) body.owner_id = owner_id
      if (visible_to !== undefined) body.visible_to = visible_to
      if (address !== undefined) body.address = address

      const result = await call('/organizations', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_list_organizations -----------------------------------------

server.tool(
  'pipedrive_list_organizations',
  'List organizations in Pipedrive. Results are paginated.',
  {
    user_id: z
      .number()
      .int()
      .optional()
      .describe('Filter organizations by owner user ID'),
    filter_id: z
      .number()
      .int()
      .optional()
      .describe('Filter ID for custom filtering'),
    start: z
      .number()
      .int()
      .optional()
      .describe('Pagination start offset (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of organizations to return (1-500, default 100)'),
    sort: z
      .string()
      .optional()
      .describe('Sort field and direction (e.g. "name ASC")'),
  },
  async ({ user_id, filter_id, start, limit, sort }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (user_id !== undefined) query.user_id = String(user_id)
      if (filter_id !== undefined) query.filter_id = String(filter_id)
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)
      if (sort !== undefined) query.sort = sort

      const result = await call('/organizations', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_create_activity --------------------------------------------

server.tool(
  'pipedrive_create_activity',
  'Create a new activity (call, meeting, task, etc.) in Pipedrive. Activities can be linked to deals, persons, or organizations. Returns the created activity.',
  {
    subject: z.string().describe('Subject/title of the activity'),
    type: z
      .string()
      .describe('Activity type key (e.g. "call", "meeting", "task", "email", "deadline", "lunch")'),
    due_date: z
      .string()
      .optional()
      .describe('Due date in YYYY-MM-DD format'),
    due_time: z
      .string()
      .optional()
      .describe('Due time in HH:MM format (24h)'),
    duration: z
      .string()
      .optional()
      .describe('Duration in HH:MM format'),
    deal_id: z
      .number()
      .int()
      .optional()
      .describe('Deal ID to associate this activity with'),
    person_id: z
      .number()
      .int()
      .optional()
      .describe('Person ID to associate this activity with'),
    org_id: z
      .number()
      .int()
      .optional()
      .describe('Organization ID to associate this activity with'),
    note: z
      .string()
      .optional()
      .describe('Additional notes or description for the activity (supports HTML)'),
    done: z
      .boolean()
      .optional()
      .describe('Whether the activity is marked as done (default: false)'),
  },
  async ({ subject, type, due_date, due_time, duration, deal_id, person_id, org_id, note, done }) => {
    try {
      const body: Record<string, unknown> = { subject, type }
      if (due_date !== undefined) body.due_date = due_date
      if (due_time !== undefined) body.due_time = due_time
      if (duration !== undefined) body.duration = duration
      if (deal_id !== undefined) body.deal_id = deal_id
      if (person_id !== undefined) body.person_id = person_id
      if (org_id !== undefined) body.org_id = org_id
      if (note !== undefined) body.note = note
      if (done !== undefined) body.done = done ? 1 : 0

      const result = await call('/activities', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_list_activities --------------------------------------------

server.tool(
  'pipedrive_list_activities',
  'List activities in Pipedrive. Results are paginated and can be filtered by user, type, and date range.',
  {
    user_id: z
      .number()
      .int()
      .optional()
      .describe('Filter activities by owner user ID'),
    type: z
      .string()
      .optional()
      .describe('Filter by activity type (e.g. "call", "meeting")'),
    start_date: z
      .string()
      .optional()
      .describe('Filter by start date in YYYY-MM-DD format'),
    end_date: z
      .string()
      .optional()
      .describe('Filter by end date in YYYY-MM-DD format'),
    done: z
      .boolean()
      .optional()
      .describe('Filter by done status: true for completed, false for pending'),
    start: z
      .number()
      .int()
      .optional()
      .describe('Pagination start offset (default: 0)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Number of activities to return (1-500, default 100)'),
  },
  async ({ user_id, type, start_date, end_date, done, start, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (user_id !== undefined) query.user_id = String(user_id)
      if (type !== undefined) query.type = type
      if (start_date !== undefined) query.start_date = start_date
      if (end_date !== undefined) query.end_date = end_date
      if (done !== undefined) query.done = done ? '1' : '0'
      if (start !== undefined) query.start = String(start)
      if (limit !== undefined) query.limit = String(limit)

      const result = await call('/activities', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- pipedrive_list_pipelines ---------------------------------------------

server.tool(
  'pipedrive_list_pipelines',
  'List all sales pipelines in Pipedrive, including their stages. Returns pipeline names, IDs, and stage details.',
  {},
  async () => {
    try {
      const result = await call('/pipelines')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
