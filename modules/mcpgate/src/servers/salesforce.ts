/**
 * Salesforce MCP Server -- Production-ready
 *
 * Provides tools to interact with the Salesforce REST API (v59.0) on behalf
 * of the authenticated user.  Credentials are injected via the
 * SALESFORCE_TOKEN environment variable and the instance URL via
 * SALESFORCE_INSTANCE_URL (set by the MCPGate gateway).
 *
 * Tools:
 *   sf_query              -- Execute a SOQL query
 *   sf_get_record         -- Get a record by type and ID
 *   sf_create_record      -- Create a new sObject record
 *   sf_update_record      -- Update an existing sObject record
 *   sf_delete_record      -- Delete a record
 *   sf_search             -- Execute a SOSL search
 *   sf_describe_object    -- Describe an sObject type
 *   sf_list_objects        -- List available sObject types
 *   sf_get_limits         -- Get org API limits
 *   sf_create_lead        -- Create a new Lead
 *   sf_create_opportunity -- Create a new Opportunity
 *   sf_create_account     -- Create a new Account
 *   sf_list_reports       -- List analytics reports
 *   sf_run_report         -- Run an analytics report
 *   sf_get_recent         -- Get recently viewed records
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const instanceUrl = process.env.SALESFORCE_INSTANCE_URL

if (!instanceUrl) {
  // We still define the server so it can be imported without crashing at module
  // load time, but every tool call will fail with a descriptive error.
}

const baseUrl = (instanceUrl || 'https://undefined.salesforce.com') + '/services/data/v59.0'

const { call, categoriseError } = createApiClient({
  name: 'salesforce',
  baseUrl,
  tokenEnvVar: 'SALESFORCE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Guard helper
// ---------------------------------------------------------------------------

function ensureInstanceUrl(): void {
  if (!process.env.SALESFORCE_INSTANCE_URL) {
    throw new Error(
      'SALESFORCE_INSTANCE_URL is not configured. Set it to your Salesforce instance URL (e.g. https://mycompany.my.salesforce.com) or connect via /v1/auth/connect/salesforce',
    )
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'salesforce-mcp',
  version: '0.1.0',
})

// ---- sf_query -------------------------------------------------------------

server.tool(
  'sf_query',
  'Execute a SOQL query against Salesforce. Returns matching records. Supports standard SOQL syntax including SELECT, WHERE, ORDER BY, LIMIT, and relationship queries.',
  {
    soql: z
      .string()
      .describe('The SOQL query to execute (e.g. "SELECT Id, Name FROM Account WHERE Industry = \'Technology\' LIMIT 10")'),
  },
  async ({ soql }) => {
    try {
      ensureInstanceUrl()
      const result = await call('/query', {
        query: { q: soql },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_get_record --------------------------------------------------------

server.tool(
  'sf_get_record',
  'Get a single Salesforce record by its sObject type and ID. Returns the full record with all accessible fields.',
  {
    sobject_type: z
      .string()
      .describe('The sObject type (e.g. "Account", "Contact", "Opportunity", "Lead")'),
    record_id: z.string().describe('The 15 or 18 character Salesforce record ID'),
    fields: z
      .array(z.string())
      .optional()
      .describe('Array of field names to return. If omitted, returns all accessible fields.'),
  },
  async ({ sobject_type, record_id, fields }) => {
    try {
      ensureInstanceUrl()
      const query: Record<string, string | undefined> = {}
      if (fields && fields.length > 0) query.fields = fields.join(',')

      const result = await call(`/sobjects/${encodeURIComponent(sobject_type)}/${encodeURIComponent(record_id)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_create_record -----------------------------------------------------

server.tool(
  'sf_create_record',
  'Create a new sObject record in Salesforce. Returns the created record ID and success status.',
  {
    sobject_type: z
      .string()
      .describe('The sObject type to create (e.g. "Account", "Contact", "Lead")'),
    fields: z
      .record(z.unknown())
      .describe('Field values for the new record as key-value pairs (e.g. { "Name": "Acme Corp", "Industry": "Technology" })'),
  },
  async ({ sobject_type, fields }) => {
    try {
      ensureInstanceUrl()
      const result = await call(`/sobjects/${encodeURIComponent(sobject_type)}`, {
        method: 'POST',
        body: fields,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_update_record -----------------------------------------------------

server.tool(
  'sf_update_record',
  'Update an existing sObject record in Salesforce. Only provided fields are changed. Returns confirmation on success.',
  {
    sobject_type: z
      .string()
      .describe('The sObject type (e.g. "Account", "Contact")'),
    record_id: z.string().describe('The Salesforce record ID to update'),
    fields: z
      .record(z.unknown())
      .describe('Field values to update as key-value pairs'),
  },
  async ({ sobject_type, record_id, fields }) => {
    try {
      ensureInstanceUrl()
      await call(`/sobjects/${encodeURIComponent(sobject_type)}/${encodeURIComponent(record_id)}`, {
        method: 'PATCH',
        body: fields,
      })
      return successContent({ updated: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_delete_record -----------------------------------------------------

server.tool(
  'sf_delete_record',
  'Delete a Salesforce record by its sObject type and ID. This action cannot be undone. Returns confirmation on success.',
  {
    sobject_type: z
      .string()
      .describe('The sObject type (e.g. "Account", "Contact")'),
    record_id: z.string().describe('The Salesforce record ID to delete'),
  },
  async ({ sobject_type, record_id }) => {
    try {
      ensureInstanceUrl()
      await call(`/sobjects/${encodeURIComponent(sobject_type)}/${encodeURIComponent(record_id)}`, {
        method: 'DELETE',
      })
      return successContent({ deleted: true })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_search ------------------------------------------------------------

server.tool(
  'sf_search',
  'Execute a SOSL search across Salesforce objects. Returns matching records grouped by sObject type.',
  {
    sosl: z
      .string()
      .describe('The SOSL search string (e.g. "FIND {Acme} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name)")'),
  },
  async ({ sosl }) => {
    try {
      ensureInstanceUrl()
      const result = await call('/search', {
        query: { q: sosl },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_describe_object ---------------------------------------------------

server.tool(
  'sf_describe_object',
  'Describe a Salesforce sObject type. Returns full metadata including fields, relationships, picklist values, record types, and validation rules.',
  {
    sobject_type: z
      .string()
      .describe('The sObject type to describe (e.g. "Account", "Contact", "Opportunity")'),
  },
  async ({ sobject_type }) => {
    try {
      ensureInstanceUrl()
      const result = await call(`/sobjects/${encodeURIComponent(sobject_type)}/describe`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_list_objects ------------------------------------------------------

server.tool(
  'sf_list_objects',
  'List all available sObject types in the Salesforce org. Returns object names, labels, key prefixes, and URLs.',
  {},
  async () => {
    try {
      ensureInstanceUrl()
      const result = await call('/sobjects')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_get_limits --------------------------------------------------------

server.tool(
  'sf_get_limits',
  'Get the current API usage limits for the Salesforce org. Returns used and remaining counts for various limit types.',
  {},
  async () => {
    try {
      ensureInstanceUrl()
      const result = await call('/limits')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_create_lead -------------------------------------------------------

server.tool(
  'sf_create_lead',
  'Create a new Lead record in Salesforce. Convenience wrapper around sf_create_record with common Lead fields. Returns the created lead ID.',
  {
    first_name: z.string().optional().describe('Lead first name'),
    last_name: z.string().describe('Lead last name (required)'),
    company: z.string().describe('Lead company name (required)'),
    email: z.string().optional().describe('Lead email address'),
    phone: z.string().optional().describe('Lead phone number'),
    title: z.string().optional().describe('Lead job title'),
    status: z
      .string()
      .optional()
      .describe('Lead status (e.g. "Open - Not Contacted", "Working - Contacted")'),
    source: z
      .string()
      .optional()
      .describe('Lead source (e.g. "Web", "Phone Inquiry", "Partner Referral")'),
    description: z.string().optional().describe('Lead description'),
    additional_fields: z
      .record(z.unknown())
      .optional()
      .describe('Additional custom fields as key-value pairs'),
  },
  async ({ first_name, last_name, company, email, phone, title, status, source, description, additional_fields }) => {
    try {
      ensureInstanceUrl()
      const fields: Record<string, unknown> = {
        LastName: last_name,
        Company: company,
        ...additional_fields,
      }
      if (first_name !== undefined) fields.FirstName = first_name
      if (email !== undefined) fields.Email = email
      if (phone !== undefined) fields.Phone = phone
      if (title !== undefined) fields.Title = title
      if (status !== undefined) fields.Status = status
      if (source !== undefined) fields.LeadSource = source
      if (description !== undefined) fields.Description = description

      const result = await call('/sobjects/Lead', {
        method: 'POST',
        body: fields,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_create_opportunity ------------------------------------------------

server.tool(
  'sf_create_opportunity',
  'Create a new Opportunity record in Salesforce. Returns the created opportunity ID.',
  {
    name: z.string().describe('Opportunity name (required)'),
    stage_name: z.string().describe('Opportunity stage (e.g. "Prospecting", "Closed Won")'),
    close_date: z.string().describe('Expected close date in YYYY-MM-DD format'),
    amount: z.number().optional().describe('Opportunity amount'),
    account_id: z.string().optional().describe('Associated Account ID'),
    probability: z.number().optional().describe('Probability of closing (0-100)'),
    description: z.string().optional().describe('Opportunity description'),
    type: z
      .string()
      .optional()
      .describe('Opportunity type (e.g. "New Business", "Existing Business")'),
    additional_fields: z
      .record(z.unknown())
      .optional()
      .describe('Additional custom fields as key-value pairs'),
  },
  async ({ name, stage_name, close_date, amount, account_id, probability, description, type, additional_fields }) => {
    try {
      ensureInstanceUrl()
      const fields: Record<string, unknown> = {
        Name: name,
        StageName: stage_name,
        CloseDate: close_date,
        ...additional_fields,
      }
      if (amount !== undefined) fields.Amount = amount
      if (account_id !== undefined) fields.AccountId = account_id
      if (probability !== undefined) fields.Probability = probability
      if (description !== undefined) fields.Description = description
      if (type !== undefined) fields.Type = type

      const result = await call('/sobjects/Opportunity', {
        method: 'POST',
        body: fields,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_create_account ----------------------------------------------------

server.tool(
  'sf_create_account',
  'Create a new Account record in Salesforce. Returns the created account ID.',
  {
    name: z.string().describe('Account name (required)'),
    industry: z.string().optional().describe('Account industry'),
    phone: z.string().optional().describe('Account phone number'),
    website: z.string().optional().describe('Account website URL'),
    type: z
      .string()
      .optional()
      .describe('Account type (e.g. "Customer", "Partner", "Prospect")'),
    billing_city: z.string().optional().describe('Billing city'),
    billing_state: z.string().optional().describe('Billing state or province'),
    billing_country: z.string().optional().describe('Billing country'),
    description: z.string().optional().describe('Account description'),
    additional_fields: z
      .record(z.unknown())
      .optional()
      .describe('Additional custom fields as key-value pairs'),
  },
  async ({ name, industry, phone, website, type, billing_city, billing_state, billing_country, description, additional_fields }) => {
    try {
      ensureInstanceUrl()
      const fields: Record<string, unknown> = {
        Name: name,
        ...additional_fields,
      }
      if (industry !== undefined) fields.Industry = industry
      if (phone !== undefined) fields.Phone = phone
      if (website !== undefined) fields.Website = website
      if (type !== undefined) fields.Type = type
      if (billing_city !== undefined) fields.BillingCity = billing_city
      if (billing_state !== undefined) fields.BillingState = billing_state
      if (billing_country !== undefined) fields.BillingCountry = billing_country
      if (description !== undefined) fields.Description = description

      const result = await call('/sobjects/Account', {
        method: 'POST',
        body: fields,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_list_reports ------------------------------------------------------

server.tool(
  'sf_list_reports',
  'List analytics reports available in the Salesforce org. Returns report names, IDs, and metadata.',
  {
    recent: z
      .boolean()
      .optional()
      .describe('If true, return only recently viewed reports (default: false)'),
  },
  async ({ recent }) => {
    try {
      ensureInstanceUrl()
      const query: Record<string, string | undefined> = {}
      if (recent) query.recentlyViewed = 'true'

      const result = await call('/analytics/reports', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_run_report --------------------------------------------------------

server.tool(
  'sf_run_report',
  'Run a Salesforce analytics report by its ID. Returns the report results including factMap data, groupings, and aggregates.',
  {
    report_id: z.string().describe('The Salesforce report ID to run'),
    include_details: z
      .boolean()
      .optional()
      .describe('Whether to include detailed row-level data (default: true)'),
  },
  async ({ report_id, include_details }) => {
    try {
      ensureInstanceUrl()
      const query: Record<string, string | undefined> = {}
      if (include_details !== undefined) query.includeDetails = String(include_details)

      const result = await call(`/analytics/reports/${encodeURIComponent(report_id)}`, {
        method: 'POST',
        body: {},
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- sf_get_recent --------------------------------------------------------

server.tool(
  'sf_get_recent',
  'Get recently viewed records for the authenticated Salesforce user. Returns a list of recently accessed records across all object types.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of recent records to return (1-200, default 25)'),
  },
  async ({ limit }) => {
    try {
      ensureInstanceUrl()
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)

      const result = await call('/recent', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
