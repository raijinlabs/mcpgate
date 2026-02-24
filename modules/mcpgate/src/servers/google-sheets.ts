/**
 * Google Sheets MCP Server -- Production-ready
 *
 * Provides tools to interact with the Google Sheets API v4 on behalf of the
 * authenticated user.  Credentials are injected via the GOOGLE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   gsheets_get_spreadsheet      -- Get spreadsheet metadata
 *   gsheets_get_values           -- Read values from a range
 *   gsheets_update_values        -- Write values to a range
 *   gsheets_append_values        -- Append rows to a sheet
 *   gsheets_clear_values         -- Clear values from a range
 *   gsheets_create_spreadsheet   -- Create a new spreadsheet
 *   gsheets_add_sheet            -- Add a new sheet tab
 *   gsheets_delete_sheet         -- Delete a sheet tab
 *   gsheets_list_sheets          -- List all sheet tabs in a spreadsheet
 *   gsheets_batch_get            -- Read multiple ranges at once
 *   gsheets_batch_update_values  -- Write to multiple ranges at once
 *   gsheets_format_cells         -- Apply formatting to a range of cells
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'google-sheets',
  baseUrl: 'https://sheets.googleapis.com/v4/spreadsheets',
  tokenEnvVar: 'GOOGLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'google-sheets-mcp',
  version: '0.1.0',
})

// ---- gsheets_get_spreadsheet ----------------------------------------------

server.tool(
  'gsheets_get_spreadsheet',
  'Get metadata for a Google Spreadsheet including title, locale, sheets, and named ranges. Returns the full spreadsheet resource.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet to retrieve'),
    fields: z
      .string()
      .optional()
      .describe('Fields to include in the response, e.g. "spreadsheetId,properties,sheets.properties"'),
  },
  async ({ spreadsheet_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields) query.fields = fields

      const result = await call(`/${encodeURIComponent(spreadsheet_id)}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_get_values ---------------------------------------------------

server.tool(
  'gsheets_get_values',
  'Read values from a specified range in a Google Spreadsheet. Returns a 2D array of cell values.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    range: z
      .string()
      .describe('The A1 notation range to read (e.g. "Sheet1!A1:D10", "Sheet1", "A1:B5")'),
    major_dimension: z
      .enum(['ROWS', 'COLUMNS'])
      .optional()
      .describe('Whether to return data grouped by rows or columns (default: ROWS)'),
    value_render_option: z
      .enum(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])
      .optional()
      .describe('How values should be rendered: FORMATTED_VALUE, UNFORMATTED_VALUE, or FORMULA'),
  },
  async ({ spreadsheet_id, range, major_dimension, value_render_option }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (major_dimension) query.majorDimension = major_dimension
      if (value_render_option) query.valueRenderOption = value_render_option

      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_update_values ------------------------------------------------

server.tool(
  'gsheets_update_values',
  'Write values to a specified range in a Google Spreadsheet. Overwrites existing data in the range. Returns the update result including number of cells updated.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    range: z
      .string()
      .describe('The A1 notation range to write to (e.g. "Sheet1!A1:D10")'),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe('2D array of values to write. Each inner array represents a row.'),
    value_input_option: z
      .enum(['RAW', 'USER_ENTERED'])
      .optional()
      .describe('How input data should be interpreted: RAW (as-is) or USER_ENTERED (parsed as if typed, default: USER_ENTERED)'),
  },
  async ({ spreadsheet_id, range, values, value_input_option }) => {
    try {
      const query: Record<string, string | undefined> = {
        valueInputOption: value_input_option || 'USER_ENTERED',
      }

      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}`,
        {
          method: 'PUT',
          body: { range, majorDimension: 'ROWS', values },
          query,
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_append_values ------------------------------------------------

server.tool(
  'gsheets_append_values',
  'Append rows of data after the last row with data in a sheet. Finds the end of existing data and writes below it. Returns the update result.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    range: z
      .string()
      .describe('The A1 notation range that defines where to search for data to append after (e.g. "Sheet1!A:D")'),
    values: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .describe('2D array of values to append. Each inner array represents a row.'),
    value_input_option: z
      .enum(['RAW', 'USER_ENTERED'])
      .optional()
      .describe('How input data should be interpreted: RAW or USER_ENTERED (default: USER_ENTERED)'),
    insert_data_option: z
      .enum(['OVERWRITE', 'INSERT_ROWS'])
      .optional()
      .describe('Whether to overwrite existing data or insert new rows (default: INSERT_ROWS)'),
  },
  async ({ spreadsheet_id, range, values, value_input_option, insert_data_option }) => {
    try {
      const query: Record<string, string | undefined> = {
        valueInputOption: value_input_option || 'USER_ENTERED',
      }
      if (insert_data_option) query.insertDataOption = insert_data_option

      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}:append`,
        {
          method: 'POST',
          body: { range, majorDimension: 'ROWS', values },
          query,
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_clear_values -------------------------------------------------

server.tool(
  'gsheets_clear_values',
  'Clear all values from a specified range in a Google Spreadsheet. Formatting is preserved but cell values are removed.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    range: z
      .string()
      .describe('The A1 notation range to clear (e.g. "Sheet1!A1:D10")'),
  },
  async ({ spreadsheet_id, range }) => {
    try {
      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}:clear`,
        { method: 'POST', body: {} },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_create_spreadsheet -------------------------------------------

server.tool(
  'gsheets_create_spreadsheet',
  'Create a new Google Spreadsheet. Returns the created spreadsheet including its ID and URL.',
  {
    title: z.string().describe('Title of the new spreadsheet'),
    sheet_titles: z
      .array(z.string())
      .optional()
      .describe('Array of sheet tab names to create. Defaults to a single "Sheet1" tab.'),
  },
  async ({ title, sheet_titles }) => {
    try {
      const body: Record<string, unknown> = {
        properties: { title },
      }
      if (sheet_titles && sheet_titles.length > 0) {
        body.sheets = sheet_titles.map((sheetTitle) => ({
          properties: { title: sheetTitle },
        }))
      }

      const result = await call('', { method: 'POST', body })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_add_sheet ----------------------------------------------------

server.tool(
  'gsheets_add_sheet',
  'Add a new sheet tab to an existing Google Spreadsheet. Returns the properties of the newly created sheet.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    title: z.string().describe('Title of the new sheet tab'),
    index: z
      .number()
      .int()
      .optional()
      .describe('Zero-based index at which to insert the sheet. Defaults to appending at the end.'),
  },
  async ({ spreadsheet_id, title, index }) => {
    try {
      const addSheetRequest: Record<string, unknown> = {
        properties: { title },
      }
      if (index !== undefined) addSheetRequest.properties = { title, index }

      const result = await call(`/${encodeURIComponent(spreadsheet_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [{ addSheet: addSheetRequest }],
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_delete_sheet -------------------------------------------------

server.tool(
  'gsheets_delete_sheet',
  'Delete a sheet tab from a Google Spreadsheet. Use gsheets_list_sheets to find the sheet ID. Returns the batch update response.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    sheet_id: z
      .number()
      .int()
      .describe('The numeric ID of the sheet tab to delete (not the sheet name -- use gsheets_list_sheets to find it)'),
  },
  async ({ spreadsheet_id, sheet_id }) => {
    try {
      const result = await call(`/${encodeURIComponent(spreadsheet_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [{ deleteSheet: { sheetId: sheet_id } }],
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_list_sheets --------------------------------------------------

server.tool(
  'gsheets_list_sheets',
  'List all sheet tabs in a Google Spreadsheet. Returns sheet names, IDs, row/column counts, and other properties.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
  },
  async ({ spreadsheet_id }) => {
    try {
      const result = await call(`/${encodeURIComponent(spreadsheet_id)}`, {
        query: { fields: 'sheets.properties' },
      }) as { sheets?: Array<{ properties?: unknown }> }
      const sheets = result.sheets?.map((s) => s.properties) ?? []
      return successContent(sheets)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_batch_get ----------------------------------------------------

server.tool(
  'gsheets_batch_get',
  'Read values from multiple ranges in a Google Spreadsheet in a single request. Returns a value range for each requested range.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    ranges: z
      .array(z.string())
      .describe('Array of A1 notation ranges to read (e.g. ["Sheet1!A1:B5", "Sheet2!C1:D10"])'),
    major_dimension: z
      .enum(['ROWS', 'COLUMNS'])
      .optional()
      .describe('Whether to return data grouped by rows or columns (default: ROWS)'),
    value_render_option: z
      .enum(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])
      .optional()
      .describe('How values should be rendered'),
  },
  async ({ spreadsheet_id, ranges, major_dimension, value_render_option }) => {
    try {
      const query: Record<string, string | undefined> = {
        ranges: ranges.join(','),
      }
      if (major_dimension) query.majorDimension = major_dimension
      if (value_render_option) query.valueRenderOption = value_render_option

      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values:batchGet`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_batch_update_values ------------------------------------------

server.tool(
  'gsheets_batch_update_values',
  'Write values to multiple ranges in a Google Spreadsheet in a single request. Returns the batch update result.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    data: z
      .array(
        z.object({
          range: z.string().describe('The A1 notation range to write to'),
          values: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
            .describe('2D array of values for this range'),
        }),
      )
      .describe('Array of range-value pairs to write'),
    value_input_option: z
      .enum(['RAW', 'USER_ENTERED'])
      .optional()
      .describe('How input data should be interpreted (default: USER_ENTERED)'),
  },
  async ({ spreadsheet_id, data, value_input_option }) => {
    try {
      const result = await call(
        `/${encodeURIComponent(spreadsheet_id)}/values:batchUpdate`,
        {
          method: 'POST',
          body: {
            valueInputOption: value_input_option || 'USER_ENTERED',
            data: data.map((d) => ({
              range: d.range,
              majorDimension: 'ROWS',
              values: d.values,
            })),
          },
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gsheets_format_cells -------------------------------------------------

server.tool(
  'gsheets_format_cells',
  'Apply formatting to a range of cells using batchUpdate with RepeatCell. Supports bold, italic, font size, background colour, number format, and more. Returns the batch update response.',
  {
    spreadsheet_id: z.string().describe('The ID of the spreadsheet'),
    sheet_id: z
      .number()
      .int()
      .describe('The numeric sheet tab ID (use gsheets_list_sheets to find it)'),
    start_row: z.number().int().describe('Zero-based start row index'),
    end_row: z.number().int().describe('Zero-based end row index (exclusive)'),
    start_column: z.number().int().describe('Zero-based start column index'),
    end_column: z.number().int().describe('Zero-based end column index (exclusive)'),
    bold: z.boolean().optional().describe('Whether to make text bold'),
    italic: z.boolean().optional().describe('Whether to make text italic'),
    font_size: z.number().int().optional().describe('Font size in points'),
    foreground_color: z
      .object({
        red: z.number().min(0).max(1).optional().describe('Red component (0-1)'),
        green: z.number().min(0).max(1).optional().describe('Green component (0-1)'),
        blue: z.number().min(0).max(1).optional().describe('Blue component (0-1)'),
      })
      .optional()
      .describe('Text colour as RGB values between 0 and 1'),
    background_color: z
      .object({
        red: z.number().min(0).max(1).optional().describe('Red component (0-1)'),
        green: z.number().min(0).max(1).optional().describe('Green component (0-1)'),
        blue: z.number().min(0).max(1).optional().describe('Blue component (0-1)'),
      })
      .optional()
      .describe('Background colour as RGB values between 0 and 1'),
    number_format_type: z
      .enum(['TEXT', 'NUMBER', 'PERCENT', 'CURRENCY', 'DATE', 'TIME', 'DATE_TIME', 'SCIENTIFIC'])
      .optional()
      .describe('Number format type for the cells'),
    number_format_pattern: z
      .string()
      .optional()
      .describe('Number format pattern string (e.g. "#,##0.00", "yyyy-mm-dd")'),
  },
  async ({
    spreadsheet_id,
    sheet_id,
    start_row,
    end_row,
    start_column,
    end_column,
    bold,
    italic,
    font_size,
    foreground_color,
    background_color,
    number_format_type,
    number_format_pattern,
  }) => {
    try {
      const cellFormat: Record<string, unknown> = {}
      const fields: string[] = []

      // Text format
      const textFormat: Record<string, unknown> = {}
      if (bold !== undefined) { textFormat.bold = bold; fields.push('userEnteredFormat.textFormat.bold') }
      if (italic !== undefined) { textFormat.italic = italic; fields.push('userEnteredFormat.textFormat.italic') }
      if (font_size !== undefined) { textFormat.fontSize = font_size; fields.push('userEnteredFormat.textFormat.fontSize') }
      if (foreground_color !== undefined) {
        textFormat.foregroundColor = foreground_color
        fields.push('userEnteredFormat.textFormat.foregroundColor')
      }
      if (Object.keys(textFormat).length > 0) {
        cellFormat.textFormat = textFormat
      }

      // Background color
      if (background_color !== undefined) {
        cellFormat.backgroundColor = background_color
        fields.push('userEnteredFormat.backgroundColor')
      }

      // Number format
      if (number_format_type !== undefined) {
        const numberFormat: Record<string, unknown> = { type: number_format_type }
        if (number_format_pattern !== undefined) numberFormat.pattern = number_format_pattern
        cellFormat.numberFormat = numberFormat
        fields.push('userEnteredFormat.numberFormat')
      }

      const result = await call(`/${encodeURIComponent(spreadsheet_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheet_id,
                  startRowIndex: start_row,
                  endRowIndex: end_row,
                  startColumnIndex: start_column,
                  endColumnIndex: end_column,
                },
                cell: {
                  userEnteredFormat: cellFormat,
                },
                fields: fields.join(','),
              },
            },
          ],
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
