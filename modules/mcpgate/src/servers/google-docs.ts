/**
 * Google Docs MCP Server -- Production-ready
 *
 * Provides tools to interact with the Google Docs API v1 on behalf of the
 * authenticated user.  Credentials are injected via the GOOGLE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   gdocs_get_document    -- Get a document's content and metadata
 *   gdocs_create_document -- Create a new blank document
 *   gdocs_batch_update    -- Send raw batchUpdate requests
 *   gdocs_insert_text     -- Insert text at a specific index
 *   gdocs_delete_content  -- Delete content in a range
 *   gdocs_replace_text    -- Find and replace all occurrences of text
 *   gdocs_insert_table    -- Insert a table at a specific index
 *   gdocs_insert_image    -- Insert an inline image at a specific index
 *   gdocs_get_named_ranges -- Get all named ranges in a document
 *   gdocs_update_style    -- Update paragraph or text style in a range
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'google-docs',
  baseUrl: 'https://docs.googleapis.com/v1/documents',
  tokenEnvVar: 'GOOGLE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'google-docs-mcp',
  version: '0.1.0',
})

// ---- gdocs_get_document ---------------------------------------------------

server.tool(
  'gdocs_get_document',
  'Get the full content and metadata of a Google Document. Returns the document title, body content tree, headers, footers, and named ranges.',
  {
    document_id: z.string().describe('The ID of the Google Document to retrieve'),
  },
  async ({ document_id }) => {
    try {
      const result = await call(`/${encodeURIComponent(document_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdocs_create_document ------------------------------------------------

server.tool(
  'gdocs_create_document',
  'Create a new blank Google Document. Returns the created document including its ID and URL.',
  {
    title: z.string().describe('Title of the new document'),
  },
  async ({ title }) => {
    try {
      const result = await call('', {
        method: 'POST',
        body: { title },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdocs_batch_update ---------------------------------------------------

server.tool(
  'gdocs_batch_update',
  'Send one or more raw batchUpdate requests to a Google Document. This is the most flexible endpoint -- it accepts any valid Docs API request objects. Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    requests: z
      .array(z.record(z.unknown()))
      .describe('Array of Docs API request objects (e.g. InsertTextRequest, DeleteContentRangeRequest). See the Google Docs API reference for the full list of request types.'),
  },
  async ({ document_id, requests }) => {
    try {
      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: { requests },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdocs_insert_text ----------------------------------------------------

server.tool(
  'gdocs_insert_text',
  'Insert text at a specific position in a Google Document. The index is 1-based and refers to the position in the document body. Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    text: z.string().describe('The text to insert'),
    index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based index in the document body where text should be inserted'),
    segment_id: z
      .string()
      .optional()
      .describe('The segment ID (e.g. header or footer ID). Omit for the main body.'),
  },
  async ({ document_id, text, index, segment_id }) => {
    try {
      const location: Record<string, unknown> = { index }
      if (segment_id !== undefined) location.segmentId = segment_id

      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              insertText: {
                location,
                text,
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

// ---- gdocs_delete_content -------------------------------------------------

server.tool(
  'gdocs_delete_content',
  'Delete content from a range in a Google Document. The range is specified by start and end indices (1-based). Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    start_index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based start index of the content to delete (inclusive)'),
    end_index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based end index of the content to delete (exclusive)'),
    segment_id: z
      .string()
      .optional()
      .describe('The segment ID (e.g. header or footer ID). Omit for the main body.'),
  },
  async ({ document_id, start_index, end_index, segment_id }) => {
    try {
      const range: Record<string, unknown> = {
        startIndex: start_index,
        endIndex: end_index,
      }
      if (segment_id !== undefined) range.segmentId = segment_id

      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              deleteContentRange: { range },
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

// ---- gdocs_replace_text ---------------------------------------------------

server.tool(
  'gdocs_replace_text',
  'Find and replace all occurrences of text in a Google Document. Supports case-sensitive matching. Returns the number of replacements made.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    find_text: z.string().describe('The text to search for'),
    replace_text: z.string().describe('The text to replace with'),
    match_case: z
      .boolean()
      .optional()
      .describe('Whether the search should be case-sensitive (default: false)'),
  },
  async ({ document_id, find_text, replace_text, match_case }) => {
    try {
      const replaceRequest: Record<string, unknown> = {
        containsText: {
          text: find_text,
          matchCase: match_case ?? false,
        },
        replaceText: replace_text,
      }

      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              replaceAllText: replaceRequest,
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

// ---- gdocs_insert_table ---------------------------------------------------

server.tool(
  'gdocs_insert_table',
  'Insert a table at a specific position in a Google Document. Creates an empty table with the specified number of rows and columns. Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    rows: z.number().int().min(1).describe('Number of rows in the table'),
    columns: z.number().int().min(1).describe('Number of columns in the table'),
    index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based index in the document body where the table should be inserted'),
  },
  async ({ document_id, rows, columns, index }) => {
    try {
      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [
            {
              insertTable: {
                rows,
                columns,
                location: { index },
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

// ---- gdocs_insert_image ---------------------------------------------------

server.tool(
  'gdocs_insert_image',
  'Insert an inline image at a specific position in a Google Document. The image is fetched from the provided URI. Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    image_uri: z.string().describe('The public URI of the image to insert'),
    index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based index in the document body where the image should be inserted'),
    width_pt: z
      .number()
      .optional()
      .describe('Width of the image in points. If omitted, the image is inserted at its natural size.'),
    height_pt: z
      .number()
      .optional()
      .describe('Height of the image in points. If omitted, the image is inserted at its natural size.'),
  },
  async ({ document_id, image_uri, index, width_pt, height_pt }) => {
    try {
      const insertInlineImage: Record<string, unknown> = {
        uri: image_uri,
        location: { index },
      }
      if (width_pt !== undefined && height_pt !== undefined) {
        insertInlineImage.objectSize = {
          width: { magnitude: width_pt, unit: 'PT' },
          height: { magnitude: height_pt, unit: 'PT' },
        }
      }

      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: {
          requests: [{ insertInlineImage }],
        },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdocs_get_named_ranges -----------------------------------------------

server.tool(
  'gdocs_get_named_ranges',
  'Get all named ranges defined in a Google Document. Named ranges are bookmarks that span a range of content. Returns a map of named range names to their details.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
  },
  async ({ document_id }) => {
    try {
      const result = await call(`/${encodeURIComponent(document_id)}`) as {
        namedRanges?: unknown
      }
      return successContent(result.namedRanges ?? {})
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- gdocs_update_style ---------------------------------------------------

server.tool(
  'gdocs_update_style',
  'Update the paragraph or text style for a range in a Google Document. Supports bold, italic, font size, font family, foreground colour, and more. Returns the batch update response.',
  {
    document_id: z.string().describe('The ID of the Google Document'),
    start_index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based start index of the range to style (inclusive)'),
    end_index: z
      .number()
      .int()
      .min(1)
      .describe('The 1-based end index of the range to style (exclusive)'),
    bold: z.boolean().optional().describe('Whether to make text bold'),
    italic: z.boolean().optional().describe('Whether to make text italic'),
    underline: z.boolean().optional().describe('Whether to underline text'),
    strikethrough: z.boolean().optional().describe('Whether to strikethrough text'),
    font_size_pt: z
      .number()
      .optional()
      .describe('Font size in points'),
    font_family: z
      .string()
      .optional()
      .describe('Font family name (e.g. "Arial", "Times New Roman")'),
    foreground_color: z
      .object({
        red: z.number().min(0).max(1).optional().describe('Red component (0-1)'),
        green: z.number().min(0).max(1).optional().describe('Green component (0-1)'),
        blue: z.number().min(0).max(1).optional().describe('Blue component (0-1)'),
      })
      .optional()
      .describe('Text colour as RGB values between 0 and 1'),
    named_style_type: z
      .enum([
        'NORMAL_TEXT',
        'TITLE',
        'SUBTITLE',
        'HEADING_1',
        'HEADING_2',
        'HEADING_3',
        'HEADING_4',
        'HEADING_5',
        'HEADING_6',
      ])
      .optional()
      .describe('Named paragraph style to apply (e.g. HEADING_1, NORMAL_TEXT)'),
  },
  async ({
    document_id,
    start_index,
    end_index,
    bold,
    italic,
    underline,
    strikethrough,
    font_size_pt,
    font_family,
    foreground_color,
    named_style_type,
  }) => {
    try {
      const requests: Array<Record<string, unknown>> = []
      const range = { startIndex: start_index, endIndex: end_index }

      // Text style updates
      const textStyle: Record<string, unknown> = {}
      const textStyleFields: string[] = []

      if (bold !== undefined) { textStyle.bold = bold; textStyleFields.push('bold') }
      if (italic !== undefined) { textStyle.italic = italic; textStyleFields.push('italic') }
      if (underline !== undefined) { textStyle.underline = underline; textStyleFields.push('underline') }
      if (strikethrough !== undefined) { textStyle.strikethrough = strikethrough; textStyleFields.push('strikethrough') }
      if (font_size_pt !== undefined) {
        textStyle.fontSize = { magnitude: font_size_pt, unit: 'PT' }
        textStyleFields.push('fontSize')
      }
      if (font_family !== undefined) {
        textStyle.weightedFontFamily = { fontFamily: font_family }
        textStyleFields.push('weightedFontFamily')
      }
      if (foreground_color !== undefined) {
        textStyle.foregroundColor = { color: { rgbColor: foreground_color } }
        textStyleFields.push('foregroundColor')
      }

      if (textStyleFields.length > 0) {
        requests.push({
          updateTextStyle: {
            range,
            textStyle,
            fields: textStyleFields.join(','),
          },
        })
      }

      // Paragraph style (named style type)
      if (named_style_type !== undefined) {
        requests.push({
          updateParagraphStyle: {
            range,
            paragraphStyle: { namedStyleType: named_style_type },
            fields: 'namedStyleType',
          },
        })
      }

      if (requests.length === 0) {
        return successContent({ message: 'No style changes specified' })
      }

      const result = await call(`/${encodeURIComponent(document_id)}:batchUpdate`, {
        method: 'POST',
        body: { requests },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
