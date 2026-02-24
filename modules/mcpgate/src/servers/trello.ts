/**
 * Trello MCP Server -- Production-ready
 *
 * Provides tools to interact with the Trello REST API on behalf of the
 * authenticated user.  Credentials are injected via the TRELLO_TOKEN
 * environment variable (format: "key:token", set by the MCPGate gateway).
 *
 * Trello uses API key + token as query parameters for authentication rather
 * than a Bearer header, so we use authStyle: 'none' and manually inject
 * the key and token into every request's query params.
 *
 * Tools:
 *   trello_create_card   -- Create a new card in a list
 *   trello_get_card      -- Retrieve a card by ID
 *   trello_update_card   -- Update fields on a card
 *   trello_list_cards    -- List cards in a list
 *   trello_move_card     -- Move a card to a different list
 *   trello_create_list   -- Create a new list on a board
 *   trello_list_lists    -- List all lists on a board
 *   trello_create_board  -- Create a new board
 *   trello_list_boards   -- List boards for the authenticated user
 *   trello_add_comment   -- Add a comment to a card
 *   trello_add_label     -- Add a label to a card
 *   trello_list_labels   -- List labels on a board
 *   trello_add_member    -- Add a member to a board
 *   trello_archive_card  -- Archive (close) a card
 *   trello_search        -- Search across boards, cards, and more
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'trello',
  baseUrl: 'https://api.trello.com/1',
  tokenEnvVar: 'TRELLO_TOKEN',
  authStyle: 'none',
})

/**
 * Parse the TRELLO_TOKEN env var (format "key:token") and return auth
 * query params to inject into every Trello API call.
 */
function authQuery(): Record<string, string> {
  const raw = process.env.TRELLO_TOKEN || ''
  const [key, token] = raw.split(':')
  if (!key || !token) {
    throw new Error(
      'Trello credentials not configured. Set TRELLO_TOKEN as "apiKey:apiToken" or connect via /v1/auth/connect/trello',
    )
  }
  return { key, token }
}

/**
 * Wrapper around `call` that injects Trello auth query params.
 */
async function trelloCall(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const auth = authQuery()
  const mergedQuery: Record<string, string | undefined> = {
    ...auth,
    ...opts.query,
  }
  return call(path, { ...opts, query: mergedQuery })
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'trello-mcp',
  version: '0.1.0',
})

// ---- trello_create_card ---------------------------------------------------

server.tool(
  'trello_create_card',
  'Create a new card in a Trello list. Returns the created card object with its ID and URL.',
  {
    idList: z.string().describe('The ID of the list to create the card in'),
    name: z.string().describe('Name / title of the card'),
    desc: z.string().optional().describe('Description of the card in Markdown format'),
    pos: z.string().optional().describe('Position of the card: "top", "bottom", or a positive float'),
    due: z.string().optional().describe('Due date in ISO 8601 format (e.g. 2025-01-15T12:00:00.000Z)'),
    idMembers: z.string().optional().describe('Comma-separated list of member IDs to assign to this card'),
    idLabels: z.string().optional().describe('Comma-separated list of label IDs to apply to this card'),
  },
  async ({ idList, name, desc, pos, due, idMembers, idLabels }) => {
    try {
      const query: Record<string, string | undefined> = { idList, name }
      if (desc !== undefined) query.desc = desc
      if (pos !== undefined) query.pos = pos
      if (due !== undefined) query.due = due
      if (idMembers !== undefined) query.idMembers = idMembers
      if (idLabels !== undefined) query.idLabels = idLabels

      const result = await trelloCall('/cards', { method: 'POST', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_get_card ------------------------------------------------------

server.tool(
  'trello_get_card',
  'Retrieve a single Trello card by its ID or shortLink. Returns the full card object including name, description, members, labels, and list info.',
  {
    id: z.string().describe('The ID or shortLink of the card to retrieve'),
    fields: z.string().optional().describe('Comma-separated list of fields to include (e.g. "name,desc,idList,due,labels")'),
  },
  async ({ id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields

      const result = await trelloCall(`/cards/${id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_update_card ---------------------------------------------------

server.tool(
  'trello_update_card',
  'Update fields on an existing Trello card. Only provided fields are changed. Returns the updated card object.',
  {
    id: z.string().describe('The ID of the card to update'),
    name: z.string().optional().describe('New name / title for the card'),
    desc: z.string().optional().describe('Updated description in Markdown'),
    due: z.string().optional().describe('Due date in ISO 8601 format, or empty string to clear'),
    dueComplete: z.boolean().optional().describe('Whether the due date has been marked complete'),
    idList: z.string().optional().describe('ID of the list to move this card to'),
    pos: z.string().optional().describe('Position of the card: "top", "bottom", or a positive float'),
    closed: z.boolean().optional().describe('Set to true to archive the card, false to unarchive'),
  },
  async ({ id, name, desc, due, dueComplete, idList, pos, closed }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (name !== undefined) query.name = name
      if (desc !== undefined) query.desc = desc
      if (due !== undefined) query.due = due
      if (dueComplete !== undefined) query.dueComplete = String(dueComplete)
      if (idList !== undefined) query.idList = idList
      if (pos !== undefined) query.pos = pos
      if (closed !== undefined) query.closed = String(closed)

      const result = await trelloCall(`/cards/${id}`, { method: 'PUT', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_list_cards ----------------------------------------------------

server.tool(
  'trello_list_cards',
  'List all cards in a Trello list. Returns an array of card objects.',
  {
    idList: z.string().describe('The ID of the list to retrieve cards from'),
    fields: z.string().optional().describe('Comma-separated list of card fields to include (e.g. "name,desc,due,idMembers,labels")'),
    filter: z.enum(['all', 'closed', 'none', 'open']).optional().describe('Filter cards by status (default: open)'),
  },
  async ({ idList, fields, filter }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields
      if (filter !== undefined) query.filter = filter

      const result = await trelloCall(`/lists/${idList}/cards`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_move_card -----------------------------------------------------

server.tool(
  'trello_move_card',
  'Move a Trello card to a different list. Optionally change the board as well. Returns the updated card object.',
  {
    id: z.string().describe('The ID of the card to move'),
    idList: z.string().describe('The ID of the destination list'),
    idBoard: z.string().optional().describe('The ID of the destination board (required only when moving across boards)'),
    pos: z.string().optional().describe('Position in the destination list: "top", "bottom", or a positive float'),
  },
  async ({ id, idList, idBoard, pos }) => {
    try {
      const query: Record<string, string | undefined> = { idList }
      if (idBoard !== undefined) query.idBoard = idBoard
      if (pos !== undefined) query.pos = pos

      const result = await trelloCall(`/cards/${id}`, { method: 'PUT', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_create_list ---------------------------------------------------

server.tool(
  'trello_create_list',
  'Create a new list on a Trello board. Returns the created list object.',
  {
    idBoard: z.string().describe('The ID of the board to create the list on'),
    name: z.string().describe('Name of the new list'),
    pos: z.string().optional().describe('Position of the list: "top", "bottom", or a positive float'),
  },
  async ({ idBoard, name, pos }) => {
    try {
      const query: Record<string, string | undefined> = { idBoard, name }
      if (pos !== undefined) query.pos = pos

      const result = await trelloCall('/lists', { method: 'POST', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_list_lists ----------------------------------------------------

server.tool(
  'trello_list_lists',
  'List all lists on a Trello board. Returns an array of list objects.',
  {
    idBoard: z.string().describe('The ID of the board to list lists from'),
    filter: z.enum(['all', 'closed', 'none', 'open']).optional().describe('Filter lists by status (default: open)'),
    fields: z.string().optional().describe('Comma-separated list of fields to include (e.g. "name,closed,pos")'),
  },
  async ({ idBoard, filter, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter !== undefined) query.filter = filter
      if (fields !== undefined) query.fields = fields

      const result = await trelloCall(`/boards/${idBoard}/lists`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_create_board --------------------------------------------------

server.tool(
  'trello_create_board',
  'Create a new Trello board. Returns the created board object with its ID and URL.',
  {
    name: z.string().describe('Name of the new board'),
    desc: z.string().optional().describe('Description of the board'),
    defaultLists: z.boolean().optional().describe('Whether to create default lists (To Do, Doing, Done). Defaults to true.'),
    idOrganization: z.string().optional().describe('ID of the Trello workspace (organisation) to create the board in'),
    prefs_permissionLevel: z.enum(['private', 'org', 'public']).optional().describe('Permission level for the board'),
    prefs_background: z.string().optional().describe('Background colour or photo for the board (e.g. "blue", "green", "red")'),
  },
  async ({ name, desc, defaultLists, idOrganization, prefs_permissionLevel, prefs_background }) => {
    try {
      const query: Record<string, string | undefined> = { name }
      if (desc !== undefined) query.desc = desc
      if (defaultLists !== undefined) query.defaultLists = String(defaultLists)
      if (idOrganization !== undefined) query.idOrganization = idOrganization
      if (prefs_permissionLevel !== undefined) query.prefs_permissionLevel = prefs_permissionLevel
      if (prefs_background !== undefined) query.prefs_background = prefs_background

      const result = await trelloCall('/boards', { method: 'POST', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_list_boards ---------------------------------------------------

server.tool(
  'trello_list_boards',
  'List all boards for the authenticated Trello user. Returns an array of board objects.',
  {
    filter: z.enum(['all', 'closed', 'members', 'open', 'organization', 'public', 'starred']).optional().describe('Filter boards by type (default: all)'),
    fields: z.string().optional().describe('Comma-separated list of board fields to include (e.g. "name,desc,url,closed")'),
  },
  async ({ filter, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter !== undefined) query.filter = filter
      if (fields !== undefined) query.fields = fields

      const result = await trelloCall('/members/me/boards', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_add_comment ---------------------------------------------------

server.tool(
  'trello_add_comment',
  'Add a comment to a Trello card. Returns the created comment action object.',
  {
    id: z.string().describe('The ID of the card to comment on'),
    text: z.string().describe('Comment text body'),
  },
  async ({ id, text }) => {
    try {
      const query: Record<string, string | undefined> = { text }

      const result = await trelloCall(`/cards/${id}/actions/comments`, {
        method: 'POST',
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_add_label -----------------------------------------------------

server.tool(
  'trello_add_label',
  'Add an existing label to a Trello card. The label must already exist on the board. Returns confirmation.',
  {
    id: z.string().describe('The ID of the card to add the label to'),
    value: z.string().describe('The ID of the label to add'),
  },
  async ({ id, value }) => {
    try {
      const query: Record<string, string | undefined> = { value }

      const result = await trelloCall(`/cards/${id}/idLabels`, {
        method: 'POST',
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_list_labels ---------------------------------------------------

server.tool(
  'trello_list_labels',
  'List all labels on a Trello board. Returns an array of label objects with their IDs, names, and colours.',
  {
    idBoard: z.string().describe('The ID of the board to list labels from'),
    fields: z.string().optional().describe('Comma-separated list of label fields to include (e.g. "name,color")'),
    limit: z.number().int().min(0).max(1000).optional().describe('Maximum number of labels to return (default 50)'),
  },
  async ({ idBoard, fields, limit }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields
      if (limit !== undefined) query.limit = String(limit)

      const result = await trelloCall(`/boards/${idBoard}/labels`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_add_member ----------------------------------------------------

server.tool(
  'trello_add_member',
  'Add a member to a Trello board. Sets the member type (admin, normal, or observer). Returns the updated members list.',
  {
    idBoard: z.string().describe('The ID of the board to add the member to'),
    idMember: z.string().describe('The ID of the Trello member to add'),
    type: z.enum(['admin', 'normal', 'observer']).optional().describe('Board membership type (default: normal)'),
  },
  async ({ idBoard, idMember, type }) => {
    try {
      const query: Record<string, string | undefined> = {
        type: type ?? 'normal',
      }

      const result = await trelloCall(`/boards/${idBoard}/members/${idMember}`, {
        method: 'PUT',
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_archive_card --------------------------------------------------

server.tool(
  'trello_archive_card',
  'Archive (close) a Trello card. Archived cards are hidden from the board but not deleted. Returns the updated card object.',
  {
    id: z.string().describe('The ID of the card to archive'),
  },
  async ({ id }) => {
    try {
      const query: Record<string, string | undefined> = { closed: 'true' }

      const result = await trelloCall(`/cards/${id}`, { method: 'PUT', query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- trello_search --------------------------------------------------------

server.tool(
  'trello_search',
  'Search across Trello boards, cards, members, and organisations. Returns matching results grouped by type.',
  {
    query: z.string().describe('Search query string'),
    idBoards: z.string().optional().describe('Comma-separated board IDs to restrict search to, or "mine" for your boards'),
    modelTypes: z.string().optional().describe('Comma-separated model types to search: actions, boards, cards, members, organizations (default: all)'),
    cards_limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of card results to return (default 10)'),
    boards_limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of board results to return (default 10)'),
    partial: z.boolean().optional().describe('Whether to match partial words (default: false)'),
  },
  async ({ query, idBoards, modelTypes, cards_limit, boards_limit, partial }) => {
    try {
      const qp: Record<string, string | undefined> = { query }
      if (idBoards !== undefined) qp.idBoards = idBoards
      if (modelTypes !== undefined) qp.modelTypes = modelTypes
      if (cards_limit !== undefined) qp.cards_limit = String(cards_limit)
      if (boards_limit !== undefined) qp.boards_limit = String(boards_limit)
      if (partial !== undefined) qp.partial = String(partial)

      const result = await trelloCall('/search', { query: qp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
