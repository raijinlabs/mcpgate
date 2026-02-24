/**
 * Zapier NLA (Natural Language Actions) MCP Server -- Production-ready
 *
 * Provides tools to interact with the Zapier NLA API on behalf of the
 * authenticated user.  Credentials are injected via the ZAPIER_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Zapier NLA allows AI to execute pre-configured Zaps using natural language.
 *
 * Tools:
 *   zapier_list_actions      -- List exposed actions
 *   zapier_execute_action    -- Execute an action
 *   zapier_get_execution_log -- Get execution log for an action
 *   zapier_preview_action    -- Preview an action without executing
 *   zapier_list_apps         -- List available Zapier apps
 *   zapier_get_action        -- Get details of a single action
 *   zapier_search_actions    -- Search for actions
 *   zapier_get_configuration -- Get current NLA configuration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'zapier',
  baseUrl: 'https://nla.zapier.com/api/v1',
  tokenEnvVar: 'ZAPIER_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'zapier-nla-mcp',
  version: '0.1.0',
})

// ---- zapier_list_actions --------------------------------------------------

server.tool(
  'zapier_list_actions',
  'List all exposed Zapier NLA actions configured for this API key. Returns action IDs, descriptions, and parameter schemas.',
  {},
  async () => {
    try {
      const result = await call('/dynamic/exposed/')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_execute_action ------------------------------------------------

server.tool(
  'zapier_execute_action',
  'Execute a Zapier NLA action. The action runs the configured Zap with the provided instructions and parameters. Returns the execution result.',
  {
    action_id: z.string().describe('The Zapier action ID to execute (from zapier_list_actions)'),
    instructions: z
      .string()
      .describe('Natural language instructions for the action (e.g. "Send an email to john@example.com with subject Hello")'),
    params: z
      .record(z.string())
      .optional()
      .describe('Optional key-value parameters to pass to the action (overrides natural language parsing)'),
  },
  async ({ action_id, instructions, params }) => {
    try {
      const body: Record<string, unknown> = { instructions }
      if (params !== undefined) {
        Object.assign(body, params)
      }

      const result = await call(`/dynamic/exposed/${action_id}/execute/`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_get_execution_log ---------------------------------------------

server.tool(
  'zapier_get_execution_log',
  'Get the execution log for a Zapier action. Returns recent execution history with statuses and results.',
  {
    action_id: z.string().describe('The Zapier action ID to get the execution log for'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ action_id, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)

      const result = await call(`/dynamic/exposed/${action_id}/execute/`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_preview_action ------------------------------------------------

server.tool(
  'zapier_preview_action',
  'Preview a Zapier NLA action without actually executing it. Shows what would happen if the action were run with the given instructions.',
  {
    action_id: z.string().describe('The Zapier action ID to preview'),
    instructions: z
      .string()
      .describe('Natural language instructions for the action preview'),
    params: z
      .record(z.string())
      .optional()
      .describe('Optional key-value parameters to pass to the action'),
  },
  async ({ action_id, instructions, params }) => {
    try {
      const body: Record<string, unknown> = {
        instructions,
        preview_only: true,
      }
      if (params !== undefined) {
        Object.assign(body, params)
      }

      const result = await call(`/dynamic/exposed/${action_id}/execute/`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_list_apps -----------------------------------------------------

server.tool(
  'zapier_list_apps',
  'List available Zapier apps that can be used with NLA actions. Returns app names and categories.',
  {
    search: z
      .string()
      .optional()
      .describe('Search query to filter apps by name'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
  },
  async ({ search, page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (search !== undefined) query.search = search
      if (page !== undefined) query.page = String(page)

      const result = await call('/apps/', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_get_action ----------------------------------------------------

server.tool(
  'zapier_get_action',
  'Get details of a single Zapier NLA action by ID. Returns action configuration, parameters, and description.',
  {
    action_id: z.string().describe('The Zapier action ID'),
  },
  async ({ action_id }) => {
    try {
      const result = await call(`/dynamic/exposed/${action_id}/`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_search_actions ------------------------------------------------

server.tool(
  'zapier_search_actions',
  'Search for Zapier NLA actions by query. Useful when you know what you want to do but not the exact action ID.',
  {
    query: z.string().describe('Natural language search query (e.g. "send email", "create spreadsheet row")'),
  },
  async ({ query }) => {
    try {
      const result = await call('/dynamic/exposed/', {
        query: { search: query },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- zapier_get_configuration ---------------------------------------------

server.tool(
  'zapier_get_configuration',
  'Get the current Zapier NLA configuration and account details. Returns API key status, exposed actions count, and configuration options.',
  {},
  async () => {
    try {
      const result = await call('/configuration-link/')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
