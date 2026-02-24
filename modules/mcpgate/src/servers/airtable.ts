/**
 * Airtable MCP Server -- Production-ready
 *
 * Provides tools to interact with the Airtable REST API on behalf of the
 * authenticated user.  Credentials are injected via the AIRTABLE_TOKEN
 * environment variable (Personal Access Token, set by the MCPGate gateway).
 *
 * Tools:
 *   airtable_list_records   -- List records in a table
 *   airtable_get_record     -- Get a single record by ID
 *   airtable_create_record  -- Create a single record
 *   airtable_update_record  -- Update a single record
 *   airtable_delete_record  -- Delete a single record
 *   airtable_list_bases     -- List accessible bases
 *   airtable_get_base_schema -- Get the schema (tables) for a base
 *   airtable_create_records -- Create multiple records in batch
 *   airtable_update_records -- Update multiple records in batch
 *   airtable_search_records -- Search records using a filterByFormula
 *   airtable_create_field   -- Create a new field in a table
 *   airtable_list_views     -- List views in a table
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'airtable',
  baseUrl: 'https://api.airtable.com/v0',
  tokenEnvVar: 'AIRTABLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'airtable-mcp',
  version: '0.1.0',
})

// ---------------------------------------------------------------------------
// Reusable schemas
// ---------------------------------------------------------------------------

const baseIdSchema = z.string().describe('The Airtable base ID (e.g. "appXXXXXXXXXXXXXX")')
const tableIdOrNameSchema = z.string().describe('Table ID (e.g. "tblXXXXXXXXXXXXXX") or table name (e.g. "Tasks")')
const recordIdSchema = z.string().describe('Record ID (e.g. "recXXXXXXXXXXXXXX")')

// ---- airtable_list_records ------------------------------------------------

server.tool(
  'airtable_list_records',
  'List records in an Airtable table. Supports pagination, sorting, field selection, and formula filtering. Returns up to 100 records per page.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    fields: z
      .array(z.string())
      .optional()
      .describe('Array of field names to include in the response (e.g. ["Name", "Status", "Due Date"])'),
    max_records: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum total number of records to return'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of records per page (1-100, default 100)'),
    sort: z
      .array(
        z.object({
          field: z.string().describe('Field name to sort by'),
          direction: z.enum(['asc', 'desc']).optional().describe('Sort direction: asc or desc (default asc)'),
        }),
      )
      .optional()
      .describe('Array of sort objects specifying field and direction'),
    view: z
      .string()
      .optional()
      .describe('View ID or name to filter records through (applies the view\'s filters and sorts)'),
    offset: z
      .string()
      .optional()
      .describe('Pagination offset from a previous response to get the next page'),
  },
  async ({ base_id, table, fields, max_records, page_size, sort, view, offset }) => {
    try {
      const query: Record<string, string | undefined> = {
        pageSize: page_size !== undefined ? String(page_size) : undefined,
        maxRecords: max_records !== undefined ? String(max_records) : undefined,
        view,
        offset,
      }

      // Airtable uses fields[] array params
      if (fields && fields.length > 0) {
        fields.forEach((f, i) => {
          query[`fields[${i}]`] = f
        })
      }

      // Sort uses sort[i][field] and sort[i][direction]
      if (sort && sort.length > 0) {
        sort.forEach((s, i) => {
          query[`sort[${i}][field]`] = s.field
          if (s.direction) query[`sort[${i}][direction]`] = s.direction
        })
      }

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_get_record --------------------------------------------------

server.tool(
  'airtable_get_record',
  'Get a single record from an Airtable table by its record ID. Returns all fields for the record.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    record_id: recordIdSchema,
  },
  async ({ base_id, table, record_id }) => {
    try {
      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}/${record_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_create_record -----------------------------------------------

server.tool(
  'airtable_create_record',
  'Create a single record in an Airtable table. Pass field values as a JSON object with field names as keys.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    fields: z
      .record(z.string(), z.unknown())
      .describe('Object of field name-value pairs (e.g. { "Name": "Task 1", "Status": "Todo", "Priority": 1 })'),
    typecast: z
      .boolean()
      .optional()
      .describe('If true, Airtable will attempt to convert string values to the correct cell type (default false)'),
  },
  async ({ base_id, table, fields, typecast }) => {
    try {
      const body: Record<string, unknown> = { fields }
      if (typecast !== undefined) body.typecast = typecast

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_update_record -----------------------------------------------

server.tool(
  'airtable_update_record',
  'Update fields on a single record. Only the specified fields will be updated; other fields remain unchanged.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    record_id: recordIdSchema,
    fields: z
      .record(z.string(), z.unknown())
      .describe('Object of field name-value pairs to update (e.g. { "Status": "Done", "Completed": true })'),
    typecast: z
      .boolean()
      .optional()
      .describe('If true, Airtable will attempt to convert string values to the correct cell type (default false)'),
  },
  async ({ base_id, table, record_id, fields, typecast }) => {
    try {
      const body: Record<string, unknown> = { fields }
      if (typecast !== undefined) body.typecast = typecast

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}/${record_id}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_delete_record -----------------------------------------------

server.tool(
  'airtable_delete_record',
  'Delete a single record from an Airtable table by its record ID. Returns confirmation with the deleted record ID.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    record_id: recordIdSchema,
  },
  async ({ base_id, table, record_id }) => {
    try {
      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}/${record_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_list_bases --------------------------------------------------

server.tool(
  'airtable_list_bases',
  'List all Airtable bases accessible to the authenticated user. Returns base IDs, names, and permission levels.',
  {
    offset: z
      .string()
      .optional()
      .describe('Pagination offset from a previous response to get the next page of bases'),
  },
  async ({ offset }) => {
    try {
      const query: Record<string, string | undefined> = { offset }
      const result = await call('/meta/bases', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_get_base_schema ---------------------------------------------

server.tool(
  'airtable_get_base_schema',
  'Get the schema for an Airtable base. Returns all tables with their fields, field types, and options.',
  {
    base_id: baseIdSchema,
  },
  async ({ base_id }) => {
    try {
      const result = await call(`/meta/bases/${base_id}/tables`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_create_records ----------------------------------------------

server.tool(
  'airtable_create_records',
  'Create multiple records in a single request (batch create). Maximum 10 records per request. Returns the created records with their new IDs.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    records: z
      .array(
        z.object({
          fields: z
            .record(z.string(), z.unknown())
            .describe('Object of field name-value pairs for this record'),
        }),
      )
      .min(1)
      .max(10)
      .describe('Array of record objects, each with a fields property (max 10 per request)'),
    typecast: z
      .boolean()
      .optional()
      .describe('If true, Airtable will attempt to convert string values to the correct cell type (default false)'),
  },
  async ({ base_id, table, records, typecast }) => {
    try {
      const body: Record<string, unknown> = { records }
      if (typecast !== undefined) body.typecast = typecast

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}`, { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_update_records ----------------------------------------------

server.tool(
  'airtable_update_records',
  'Update multiple records in a single request (batch update). Maximum 10 records per request. Only specified fields are updated.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    records: z
      .array(
        z.object({
          id: z.string().describe('Record ID to update (e.g. "recXXXXXXXXXXXXXX")'),
          fields: z
            .record(z.string(), z.unknown())
            .describe('Object of field name-value pairs to update for this record'),
        }),
      )
      .min(1)
      .max(10)
      .describe('Array of record objects, each with an id and fields property (max 10 per request)'),
    typecast: z
      .boolean()
      .optional()
      .describe('If true, Airtable will attempt to convert string values to the correct cell type (default false)'),
  },
  async ({ base_id, table, records, typecast }) => {
    try {
      const body: Record<string, unknown> = { records }
      if (typecast !== undefined) body.typecast = typecast

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}`, { method: 'PATCH', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_search_records ----------------------------------------------

server.tool(
  'airtable_search_records',
  'Search for records in an Airtable table using a filterByFormula. Airtable formulas support operators like =, !=, AND(), OR(), FIND(), and more.',
  {
    base_id: baseIdSchema,
    table: tableIdOrNameSchema,
    formula: z
      .string()
      .describe(
        'Airtable filterByFormula expression (e.g. "AND({Status}=\'Done\', {Priority}>=3)", "FIND(\'keyword\', {Name})")',
      ),
    fields: z
      .array(z.string())
      .optional()
      .describe('Array of field names to include in the response'),
    max_records: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum total number of matching records to return'),
    sort: z
      .array(
        z.object({
          field: z.string().describe('Field name to sort by'),
          direction: z.enum(['asc', 'desc']).optional().describe('Sort direction: asc or desc'),
        }),
      )
      .optional()
      .describe('Array of sort objects specifying field and direction'),
    view: z
      .string()
      .optional()
      .describe('View ID or name to apply as a base filter before the formula'),
  },
  async ({ base_id, table, formula, fields, max_records, sort, view }) => {
    try {
      const query: Record<string, string | undefined> = {
        filterByFormula: formula,
        maxRecords: max_records !== undefined ? String(max_records) : undefined,
        view,
      }

      if (fields && fields.length > 0) {
        fields.forEach((f, i) => {
          query[`fields[${i}]`] = f
        })
      }

      if (sort && sort.length > 0) {
        sort.forEach((s, i) => {
          query[`sort[${i}][field]`] = s.field
          if (s.direction) query[`sort[${i}][direction]`] = s.direction
        })
      }

      const encodedTable = encodeURIComponent(table)
      const result = await call(`/${base_id}/${encodedTable}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_create_field ------------------------------------------------

server.tool(
  'airtable_create_field',
  'Create a new field (column) in an Airtable table. Returns the created field metadata including its ID and type.',
  {
    base_id: baseIdSchema,
    table_id: z.string().describe('Table ID (e.g. "tblXXXXXXXXXXXXXX") -- must be the table ID, not name'),
    name: z.string().describe('Name of the new field'),
    type: z
      .string()
      .describe(
        'Field type (e.g. "singleLineText", "multilineText", "number", "singleSelect", "multipleSelects", "date", "checkbox", "url", "email", "currency", "percent", "rating")',
      ),
    description: z
      .string()
      .optional()
      .describe('Human-readable description of the field'),
    options: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Type-specific options (e.g. for singleSelect: { choices: [{ name: "Option A" }] })'),
  },
  async ({ base_id, table_id, name, type, description, options }) => {
    try {
      const body: Record<string, unknown> = { name, type }
      if (description !== undefined) body.description = description
      if (options !== undefined) body.options = options

      const result = await call(`/meta/bases/${base_id}/tables/${table_id}/fields`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- airtable_list_views --------------------------------------------------

server.tool(
  'airtable_list_views',
  'List all views in an Airtable table. Returns view IDs, names, and types (grid, form, calendar, gallery, kanban).',
  {
    base_id: baseIdSchema,
    table_id: z.string().describe('Table ID (e.g. "tblXXXXXXXXXXXXXX") to list views for'),
  },
  async ({ base_id, table_id }) => {
    try {
      // Views are included in the table schema response
      const result = await call(`/meta/bases/${base_id}/tables`)
      // Extract views for the requested table from the schema
      const schema = result as { tables?: Array<{ id: string; views?: unknown[] }> }
      const table = schema.tables?.find((t) => t.id === table_id)
      if (table) {
        return successContent({ views: table.views || [] })
      }
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
