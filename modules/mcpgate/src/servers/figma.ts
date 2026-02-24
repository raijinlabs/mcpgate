/**
 * Figma MCP Server -- Production-ready
 *
 * Provides tools to interact with the Figma REST API on behalf of the
 * authenticated user.  Credentials are injected via the FIGMA_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   figma_get_file             -- Get a Figma file
 *   figma_get_file_nodes       -- Get specific nodes from a file
 *   figma_get_images           -- Export images from a file
 *   figma_get_comments         -- List comments on a file
 *   figma_post_comment         -- Post a comment on a file
 *   figma_list_projects        -- List projects in a team
 *   figma_list_project_files   -- List files in a project
 *   figma_get_team_components  -- Get components for a team
 *   figma_get_team_styles      -- Get styles for a team
 *   figma_get_component        -- Get a single component by key
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'figma',
  baseUrl: 'https://api.figma.com/v1',
  tokenEnvVar: 'FIGMA_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'figma-mcp',
  version: '0.1.0',
})

// ---- figma_get_file -------------------------------------------------------

server.tool(
  'figma_get_file',
  'Retrieve a Figma file by its key. Returns the document tree with pages, frames, and layers. Can optionally return only specific data.',
  {
    file_key: z.string().describe('The Figma file key (from the URL: figma.com/file/{key}/...)'),
    version: z
      .string()
      .optional()
      .describe('Specific version ID to retrieve (omit for latest)'),
    depth: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Depth of the document tree to traverse (1 = pages only, 2 = pages + top-level frames, etc.)'),
    geometry: z
      .enum(['paths'])
      .optional()
      .describe('Set to "paths" to include vector path data'),
  },
  async ({ file_key, version, depth, geometry }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (version !== undefined) query.version = version
      if (depth !== undefined) query.depth = String(depth)
      if (geometry !== undefined) query.geometry = geometry

      const result = await call(`/files/${file_key}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_file_nodes -------------------------------------------------

server.tool(
  'figma_get_file_nodes',
  'Retrieve specific nodes from a Figma file by their IDs. More efficient than fetching the whole file when you only need certain elements.',
  {
    file_key: z.string().describe('The Figma file key'),
    ids: z.string().describe('Comma-separated list of node IDs to retrieve (e.g. "1:2,3:4")'),
    version: z
      .string()
      .optional()
      .describe('Specific version ID to retrieve'),
    depth: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Depth of the node tree to traverse'),
    geometry: z
      .enum(['paths'])
      .optional()
      .describe('Set to "paths" to include vector path data'),
  },
  async ({ file_key, ids, version, depth, geometry }) => {
    try {
      const query: Record<string, string | undefined> = { ids }
      if (version !== undefined) query.version = version
      if (depth !== undefined) query.depth = String(depth)
      if (geometry !== undefined) query.geometry = geometry

      const result = await call(`/files/${file_key}/nodes`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_images -----------------------------------------------------

server.tool(
  'figma_get_images',
  'Export images from a Figma file. Renders specified nodes as PNG, JPG, SVG, or PDF and returns download URLs.',
  {
    file_key: z.string().describe('The Figma file key'),
    ids: z.string().describe('Comma-separated list of node IDs to export (e.g. "1:2,3:4")'),
    format: z
      .enum(['jpg', 'png', 'svg', 'pdf'])
      .optional()
      .describe('Image export format (default "png")'),
    scale: z
      .number()
      .min(0.01)
      .max(4)
      .optional()
      .describe('Export scale factor (0.01-4, default 1)'),
    svg_include_id: z
      .boolean()
      .optional()
      .describe('Whether to include node IDs in SVG output'),
    svg_simplify_stroke: z
      .boolean()
      .optional()
      .describe('Whether to simplify inside/outside strokes in SVG output'),
    version: z
      .string()
      .optional()
      .describe('Specific version ID to export from'),
  },
  async ({ file_key, ids, format, scale, svg_include_id, svg_simplify_stroke, version }) => {
    try {
      const query: Record<string, string | undefined> = { ids }
      if (format !== undefined) query.format = format
      if (scale !== undefined) query.scale = String(scale)
      if (svg_include_id !== undefined) query.svg_include_id = String(svg_include_id)
      if (svg_simplify_stroke !== undefined) query.svg_simplify_stroke = String(svg_simplify_stroke)
      if (version !== undefined) query.version = version

      const result = await call(`/images/${file_key}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_comments ---------------------------------------------------

server.tool(
  'figma_get_comments',
  'List all comments on a Figma file. Returns comments with their content, author, position, and replies.',
  {
    file_key: z.string().describe('The Figma file key to get comments for'),
    as_md: z
      .boolean()
      .optional()
      .describe('Whether to return comment bodies as Markdown (default false)'),
  },
  async ({ file_key, as_md }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (as_md !== undefined) query.as_md = String(as_md)

      const result = await call(`/files/${file_key}/comments`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_post_comment ---------------------------------------------------

server.tool(
  'figma_post_comment',
  'Post a new comment on a Figma file. Can be a top-level comment or a reply to an existing comment.',
  {
    file_key: z.string().describe('The Figma file key to comment on'),
    message: z.string().describe('The comment message text'),
    comment_id: z
      .string()
      .optional()
      .describe('ID of an existing comment to reply to (omit for a new top-level comment)'),
    client_meta: z
      .object({
        x: z.number().optional().describe('X coordinate for pin position'),
        y: z.number().optional().describe('Y coordinate for pin position'),
        node_id: z.string().optional().describe('Node ID to attach the comment to'),
        node_offset: z
          .object({
            x: z.number().describe('X offset within the node'),
            y: z.number().describe('Y offset within the node'),
          })
          .optional()
          .describe('Offset within the target node'),
      })
      .optional()
      .describe('Position metadata for the comment pin on the canvas'),
  },
  async ({ file_key, message, comment_id, client_meta }) => {
    try {
      const body: Record<string, unknown> = { message }
      if (comment_id !== undefined) body.comment_id = comment_id
      if (client_meta !== undefined) body.client_meta = client_meta

      const result = await call(`/files/${file_key}/comments`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_list_projects --------------------------------------------------

server.tool(
  'figma_list_projects',
  'List all projects in a Figma team. Returns project IDs and names.',
  {
    team_id: z.string().describe('The Figma team ID'),
  },
  async ({ team_id }) => {
    try {
      const result = await call(`/teams/${team_id}/projects`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_list_project_files ---------------------------------------------

server.tool(
  'figma_list_project_files',
  'List all files in a Figma project. Returns file keys, names, and last modified timestamps.',
  {
    project_id: z.string().describe('The Figma project ID'),
  },
  async ({ project_id }) => {
    try {
      const result = await call(`/projects/${project_id}/files`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_team_components --------------------------------------------

server.tool(
  'figma_get_team_components',
  'Get published components for a Figma team. Returns component keys, names, descriptions, and thumbnail URLs. Results are paginated.',
  {
    team_id: z.string().describe('The Figma team ID'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of components to return per page (1-100, default 30)'),
    after: z
      .number()
      .int()
      .optional()
      .describe('Cursor for pagination -- component index to start after'),
  },
  async ({ team_id, page_size, after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.page_size = String(page_size)
      if (after !== undefined) query.after = String(after)

      const result = await call(`/teams/${team_id}/components`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_team_styles ------------------------------------------------

server.tool(
  'figma_get_team_styles',
  'Get published styles for a Figma team. Returns style keys, names, descriptions, and types (fill, text, effect, grid). Results are paginated.',
  {
    team_id: z.string().describe('The Figma team ID'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of styles to return per page (1-100, default 30)'),
    after: z
      .number()
      .int()
      .optional()
      .describe('Cursor for pagination -- style index to start after'),
  },
  async ({ team_id, page_size, after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.page_size = String(page_size)
      if (after !== undefined) query.after = String(after)

      const result = await call(`/teams/${team_id}/styles`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- figma_get_component --------------------------------------------------

server.tool(
  'figma_get_component',
  'Retrieve a single published Figma component by its key. Returns the component metadata, description, and containing file information.',
  {
    component_key: z.string().describe('The unique key of the published component'),
  },
  async ({ component_key }) => {
    try {
      const result = await call(`/components/${component_key}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
