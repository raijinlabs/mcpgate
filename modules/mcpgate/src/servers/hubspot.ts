/**
 * HubSpot MCP Server -- Production-ready
 *
 * Provides tools to interact with the HubSpot CRM API on behalf of the
 * authenticated user.  Credentials are injected via the HUBSPOT_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   hubspot_create_contact  -- Create a new CRM contact
 *   hubspot_get_contact     -- Get a contact by ID
 *   hubspot_update_contact  -- Update a contact's properties
 *   hubspot_list_contacts   -- List contacts with pagination
 *   hubspot_search_contacts -- Search contacts with filters
 *   hubspot_create_deal     -- Create a new deal
 *   hubspot_get_deal        -- Get a deal by ID
 *   hubspot_update_deal     -- Update a deal's properties
 *   hubspot_list_deals      -- List deals with pagination
 *   hubspot_search_deals    -- Search deals with filters
 *   hubspot_create_company  -- Create a new company
 *   hubspot_list_companies  -- List companies with pagination
 *   hubspot_create_note     -- Create a note with associations
 *   hubspot_list_pipelines  -- List deal pipelines and stages
 *   hubspot_create_task     -- Create a task
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'hubspot',
  baseUrl: 'https://api.hubapi.com',
  tokenEnvVar: 'HUBSPOT_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'hubspot-mcp',
  version: '0.1.0',
})

// ---- hubspot_create_contact -----------------------------------------------

server.tool(
  'hubspot_create_contact',
  'Create a new contact in HubSpot CRM. Returns the created contact including its ID and properties.',
  {
    email: z.string().optional().describe('Contact email address'),
    firstname: z.string().optional().describe('Contact first name'),
    lastname: z.string().optional().describe('Contact last name'),
    phone: z.string().optional().describe('Contact phone number'),
    company: z.string().optional().describe('Contact company name'),
    website: z.string().optional().describe('Contact website URL'),
    jobtitle: z.string().optional().describe('Contact job title'),
    properties: z
      .record(z.string())
      .optional()
      .describe('Additional custom properties as key-value pairs'),
  },
  async ({ email, firstname, lastname, phone, company, website, jobtitle, properties }) => {
    try {
      const props: Record<string, string> = { ...properties }
      if (email !== undefined) props.email = email
      if (firstname !== undefined) props.firstname = firstname
      if (lastname !== undefined) props.lastname = lastname
      if (phone !== undefined) props.phone = phone
      if (company !== undefined) props.company = company
      if (website !== undefined) props.website = website
      if (jobtitle !== undefined) props.jobtitle = jobtitle

      const result = await call('/crm/v3/objects/contacts', {
        method: 'POST',
        body: { properties: props },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_get_contact --------------------------------------------------

server.tool(
  'hubspot_get_contact',
  'Get a HubSpot contact by its ID. Returns the contact properties and metadata.',
  {
    contact_id: z.string().describe('The HubSpot contact ID'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response (e.g. ["email", "firstname", "lastname"])'),
  },
  async ({ contact_id, properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (properties && properties.length > 0) query.properties = properties.join(',')

      const result = await call(`/crm/v3/objects/contacts/${encodeURIComponent(contact_id)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_update_contact -----------------------------------------------

server.tool(
  'hubspot_update_contact',
  'Update properties of an existing HubSpot contact. Only provided properties are changed. Returns the updated contact.',
  {
    contact_id: z.string().describe('The HubSpot contact ID to update'),
    properties: z
      .record(z.string())
      .describe('Properties to update as key-value pairs (e.g. { "email": "new@example.com", "phone": "+1234567890" })'),
  },
  async ({ contact_id, properties }) => {
    try {
      const result = await call(`/crm/v3/objects/contacts/${encodeURIComponent(contact_id)}`, {
        method: 'PATCH',
        body: { properties },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_list_contacts ------------------------------------------------

server.tool(
  'hubspot_list_contacts',
  'List contacts in HubSpot CRM. Results are paginated via cursor. Returns contact IDs, properties, and a paging token.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of contacts to return (1-100, default 10)'),
    after: z
      .string()
      .optional()
      .describe('Cursor token for pagination, from the previous response\'s paging.next.after'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response'),
  },
  async ({ limit, after, properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (after) query.after = after
      if (properties && properties.length > 0) query.properties = properties.join(',')

      const result = await call('/crm/v3/objects/contacts', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_search_contacts ----------------------------------------------

server.tool(
  'hubspot_search_contacts',
  'Search for contacts in HubSpot CRM using filters. Supports property filters, sorting, and pagination. Returns matching contacts.',
  {
    query: z
      .string()
      .optional()
      .describe('Free-text search query to match against default searchable properties'),
    filter_groups: z
      .array(
        z.object({
          filters: z
            .array(
              z.object({
                propertyName: z.string().describe('The property name to filter on'),
                operator: z
                  .enum([
                    'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE',
                    'BETWEEN', 'IN', 'NOT_IN', 'HAS_PROPERTY',
                    'NOT_HAS_PROPERTY', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN',
                  ])
                  .describe('The filter operator'),
                value: z.string().optional().describe('The value to compare against'),
                values: z
                  .array(z.string())
                  .optional()
                  .describe('Array of values for IN/NOT_IN operators'),
              }),
            )
            .describe('Array of filters within this group (AND logic)'),
        }),
      )
      .optional()
      .describe('Array of filter groups (OR logic between groups, AND logic within each group)'),
    sorts: z
      .array(z.string())
      .optional()
      .describe('Array of sort strings (e.g. ["createdate:desc", "lastname:asc"])'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 10)'),
    after: z
      .string()
      .optional()
      .describe('Cursor token for pagination'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the results'),
  },
  async ({ query, filter_groups, sorts, limit, after, properties }) => {
    try {
      const body: Record<string, unknown> = {}
      if (query !== undefined) body.query = query
      if (filter_groups !== undefined) body.filterGroups = filter_groups
      if (sorts !== undefined) body.sorts = sorts
      if (limit !== undefined) body.limit = limit
      if (after !== undefined) body.after = after
      if (properties !== undefined) body.properties = properties

      const result = await call('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_create_deal --------------------------------------------------

server.tool(
  'hubspot_create_deal',
  'Create a new deal in HubSpot CRM. Returns the created deal including its ID and properties.',
  {
    dealname: z.string().describe('Name of the deal'),
    pipeline: z
      .string()
      .optional()
      .describe('Pipeline ID for the deal. Use hubspot_list_pipelines to find available pipelines.'),
    dealstage: z
      .string()
      .optional()
      .describe('Deal stage ID within the pipeline. Use hubspot_list_pipelines to find available stages.'),
    amount: z.string().optional().describe('Deal amount as a string (e.g. "10000")'),
    closedate: z
      .string()
      .optional()
      .describe('Expected close date in ISO 8601 format (e.g. "2024-12-31")'),
    properties: z
      .record(z.string())
      .optional()
      .describe('Additional custom properties as key-value pairs'),
  },
  async ({ dealname, pipeline, dealstage, amount, closedate, properties }) => {
    try {
      const props: Record<string, string> = { dealname, ...properties }
      if (pipeline !== undefined) props.pipeline = pipeline
      if (dealstage !== undefined) props.dealstage = dealstage
      if (amount !== undefined) props.amount = amount
      if (closedate !== undefined) props.closedate = closedate

      const result = await call('/crm/v3/objects/deals', {
        method: 'POST',
        body: { properties: props },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_get_deal -----------------------------------------------------

server.tool(
  'hubspot_get_deal',
  'Get a HubSpot deal by its ID. Returns the deal properties and metadata.',
  {
    deal_id: z.string().describe('The HubSpot deal ID'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response'),
  },
  async ({ deal_id, properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (properties && properties.length > 0) query.properties = properties.join(',')

      const result = await call(`/crm/v3/objects/deals/${encodeURIComponent(deal_id)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_update_deal --------------------------------------------------

server.tool(
  'hubspot_update_deal',
  'Update properties of an existing HubSpot deal. Only provided properties are changed. Returns the updated deal.',
  {
    deal_id: z.string().describe('The HubSpot deal ID to update'),
    properties: z
      .record(z.string())
      .describe('Properties to update as key-value pairs (e.g. { "dealstage": "closedwon", "amount": "50000" })'),
  },
  async ({ deal_id, properties }) => {
    try {
      const result = await call(`/crm/v3/objects/deals/${encodeURIComponent(deal_id)}`, {
        method: 'PATCH',
        body: { properties },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_list_deals ---------------------------------------------------

server.tool(
  'hubspot_list_deals',
  'List deals in HubSpot CRM. Results are paginated via cursor.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of deals to return (1-100, default 10)'),
    after: z
      .string()
      .optional()
      .describe('Cursor token for pagination'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response'),
  },
  async ({ limit, after, properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (after) query.after = after
      if (properties && properties.length > 0) query.properties = properties.join(',')

      const result = await call('/crm/v3/objects/deals', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_search_deals -------------------------------------------------

server.tool(
  'hubspot_search_deals',
  'Search for deals in HubSpot CRM using filters. Supports property filters, sorting, and pagination.',
  {
    query: z
      .string()
      .optional()
      .describe('Free-text search query'),
    filter_groups: z
      .array(
        z.object({
          filters: z
            .array(
              z.object({
                propertyName: z.string().describe('The property name to filter on'),
                operator: z
                  .enum([
                    'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE',
                    'BETWEEN', 'IN', 'NOT_IN', 'HAS_PROPERTY',
                    'NOT_HAS_PROPERTY', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN',
                  ])
                  .describe('The filter operator'),
                value: z.string().optional().describe('The value to compare against'),
                values: z.array(z.string()).optional().describe('Array of values for IN/NOT_IN operators'),
              }),
            )
            .describe('Array of filters within this group (AND logic)'),
        }),
      )
      .optional()
      .describe('Array of filter groups (OR logic between groups)'),
    sorts: z
      .array(z.string())
      .optional()
      .describe('Array of sort strings (e.g. ["amount:desc"])'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of results to return (default 10)'),
    after: z.string().optional().describe('Cursor token for pagination'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the results'),
  },
  async ({ query, filter_groups, sorts, limit, after, properties }) => {
    try {
      const body: Record<string, unknown> = {}
      if (query !== undefined) body.query = query
      if (filter_groups !== undefined) body.filterGroups = filter_groups
      if (sorts !== undefined) body.sorts = sorts
      if (limit !== undefined) body.limit = limit
      if (after !== undefined) body.after = after
      if (properties !== undefined) body.properties = properties

      const result = await call('/crm/v3/objects/deals/search', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_create_company -----------------------------------------------

server.tool(
  'hubspot_create_company',
  'Create a new company in HubSpot CRM. Returns the created company including its ID and properties.',
  {
    name: z.string().describe('Company name'),
    domain: z.string().optional().describe('Company website domain (e.g. "example.com")'),
    industry: z.string().optional().describe('Industry the company belongs to'),
    phone: z.string().optional().describe('Company phone number'),
    city: z.string().optional().describe('Company city'),
    state: z.string().optional().describe('Company state or region'),
    country: z.string().optional().describe('Company country'),
    properties: z
      .record(z.string())
      .optional()
      .describe('Additional custom properties as key-value pairs'),
  },
  async ({ name, domain, industry, phone, city, state, country, properties }) => {
    try {
      const props: Record<string, string> = { name, ...properties }
      if (domain !== undefined) props.domain = domain
      if (industry !== undefined) props.industry = industry
      if (phone !== undefined) props.phone = phone
      if (city !== undefined) props.city = city
      if (state !== undefined) props.state = state
      if (country !== undefined) props.country = country

      const result = await call('/crm/v3/objects/companies', {
        method: 'POST',
        body: { properties: props },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_list_companies -----------------------------------------------

server.tool(
  'hubspot_list_companies',
  'List companies in HubSpot CRM. Results are paginated via cursor.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of companies to return (1-100, default 10)'),
    after: z
      .string()
      .optional()
      .describe('Cursor token for pagination'),
    properties: z
      .array(z.string())
      .optional()
      .describe('Array of property names to include in the response'),
  },
  async ({ limit, after, properties }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (after) query.after = after
      if (properties && properties.length > 0) query.properties = properties.join(',')

      const result = await call('/crm/v3/objects/companies', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_create_note --------------------------------------------------

server.tool(
  'hubspot_create_note',
  'Create a note (engagement) in HubSpot CRM with optional associations to contacts, deals, or companies. Returns the created note.',
  {
    body: z.string().describe('The note body content (supports HTML)'),
    contact_ids: z
      .array(z.string())
      .optional()
      .describe('Array of contact IDs to associate the note with'),
    deal_ids: z
      .array(z.string())
      .optional()
      .describe('Array of deal IDs to associate the note with'),
    company_ids: z
      .array(z.string())
      .optional()
      .describe('Array of company IDs to associate the note with'),
    timestamp: z
      .string()
      .optional()
      .describe('Timestamp for the note in ISO 8601 format. Defaults to current time.'),
  },
  async ({ body, contact_ids, deal_ids, company_ids, timestamp }) => {
    try {
      const properties: Record<string, string> = {
        hs_note_body: body,
      }
      if (timestamp !== undefined) properties.hs_timestamp = timestamp

      const associations: Array<Record<string, unknown>> = []

      if (contact_ids) {
        for (const id of contact_ids) {
          associations.push({
            to: { id },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          })
        }
      }
      if (deal_ids) {
        for (const id of deal_ids) {
          associations.push({
            to: { id },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
          })
        }
      }
      if (company_ids) {
        for (const id of company_ids) {
          associations.push({
            to: { id },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }],
          })
        }
      }

      const payload: Record<string, unknown> = { properties }
      if (associations.length > 0) payload.associations = associations

      const result = await call('/crm/v3/objects/notes', {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_list_pipelines -----------------------------------------------

server.tool(
  'hubspot_list_pipelines',
  'List all deal pipelines and their stages in HubSpot CRM. Returns pipeline names, IDs, and stage details.',
  {},
  async () => {
    try {
      const result = await call('/crm/v3/pipelines/deals')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- hubspot_create_task --------------------------------------------------

server.tool(
  'hubspot_create_task',
  'Create a task in HubSpot CRM. Tasks can be associated with contacts, deals, or companies. Returns the created task.',
  {
    subject: z.string().describe('Subject/title of the task'),
    body: z.string().optional().describe('Task description or body content'),
    status: z
      .enum(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED'])
      .optional()
      .describe('Task status (default: NOT_STARTED)'),
    priority: z
      .enum(['LOW', 'MEDIUM', 'HIGH'])
      .optional()
      .describe('Task priority level'),
    due_date: z
      .string()
      .optional()
      .describe('Due date in ISO 8601 format (e.g. "2024-12-31")'),
    owner_id: z
      .string()
      .optional()
      .describe('HubSpot owner ID to assign the task to'),
    contact_ids: z
      .array(z.string())
      .optional()
      .describe('Array of contact IDs to associate the task with'),
    deal_ids: z
      .array(z.string())
      .optional()
      .describe('Array of deal IDs to associate the task with'),
  },
  async ({ subject, body, status, priority, due_date, owner_id, contact_ids, deal_ids }) => {
    try {
      const properties: Record<string, string> = {
        hs_task_subject: subject,
        hs_task_status: status || 'NOT_STARTED',
      }
      if (body !== undefined) properties.hs_task_body = body
      if (priority !== undefined) properties.hs_task_priority = priority
      if (due_date !== undefined) properties.hs_timestamp = due_date
      if (owner_id !== undefined) properties.hubspot_owner_id = owner_id

      const associations: Array<Record<string, unknown>> = []
      if (contact_ids) {
        for (const id of contact_ids) {
          associations.push({
            to: { id },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
          })
        }
      }
      if (deal_ids) {
        for (const id of deal_ids) {
          associations.push({
            to: { id },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }],
          })
        }
      }

      const payload: Record<string, unknown> = { properties }
      if (associations.length > 0) payload.associations = associations

      const result = await call('/crm/v3/objects/tasks', {
        method: 'POST',
        body: payload,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
