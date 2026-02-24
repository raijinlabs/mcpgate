/**
 * Monday.com MCP Server -- Production-ready
 *
 * Provides tools to interact with the Monday.com GraphQL API on behalf of
 * the authenticated user.  Credentials are injected via the MONDAY_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Monday.com's API is entirely GraphQL-based, so this server uses the
 * createGraphQLClient factory.
 *
 * Tools:
 *   monday_create_item   -- Create an item (row) on a board
 *   monday_get_item      -- Retrieve an item by ID
 *   monday_update_item   -- Update a column value on an item
 *   monday_list_items    -- List items on a board
 *   monday_create_board  -- Create a new board
 *   monday_list_boards   -- List boards accessible to the user
 *   monday_create_column -- Create a new column on a board
 *   monday_add_update    -- Add an update (comment) to an item
 *   monday_list_updates  -- List updates (comments) on an item
 *   monday_move_item     -- Move an item to a different group
 *   monday_archive_item  -- Archive an item
 *   monday_search        -- Search items by column value
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createGraphQLClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------------

const { query, categoriseError } = createGraphQLClient({
  name: 'monday',
  endpoint: 'https://api.monday.com/v2',
  tokenEnvVar: 'MONDAY_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'monday-mcp',
  version: '0.1.0',
})

// ---- monday_create_item ---------------------------------------------------

server.tool(
  'monday_create_item',
  'Create a new item (row) on a Monday.com board. Optionally assign it to a specific group and set column values. Returns the created item with its ID and name.',
  {
    board_id: z.string().describe('The numeric ID of the board to create the item on (as a string)'),
    item_name: z.string().describe('Name of the item to create'),
    group_id: z.string().optional().describe('ID of the group (section) within the board to place the item in'),
    column_values: z.string().optional().describe('JSON string of column values to set (e.g. \'{"status": {"label": "Working on it"}, "date4": {"date": "2025-01-15"}}\')'),
  },
  async ({ board_id, item_name, group_id, column_values }) => {
    try {
      const vars: Record<string, unknown> = {
        boardId: Number(board_id),
        itemName: item_name,
      }
      if (group_id !== undefined) vars.groupId = group_id
      if (column_values !== undefined) vars.columnValues = column_values

      let gql = `mutation CreateItem($boardId: ID!, $itemName: String!`
      if (group_id !== undefined) gql += `, $groupId: String!`
      if (column_values !== undefined) gql += `, $columnValues: JSON`
      gql += `) {
        create_item(board_id: $boardId, item_name: $itemName`
      if (group_id !== undefined) gql += `, group_id: $groupId`
      if (column_values !== undefined) gql += `, column_values: $columnValues`
      gql += `) {
          id
          name
          state
          group { id title }
          column_values { id text value }
        }
      }`

      const result = await query(gql, vars)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_get_item ------------------------------------------------------

server.tool(
  'monday_get_item',
  'Retrieve a Monday.com item by its ID. Returns the item with its name, group, column values, and board info.',
  {
    item_id: z.string().describe('The numeric ID of the item to retrieve (as a string)'),
  },
  async ({ item_id }) => {
    try {
      const gql = `query GetItem($itemId: [ID!]!) {
        items(ids: $itemId) {
          id
          name
          state
          created_at
          updated_at
          group { id title }
          board { id name }
          column_values { id title text value type }
          updates(limit: 5) { id body created_at creator { id name } }
        }
      }`

      const result = await query(gql, { itemId: [Number(item_id)] })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_update_item ---------------------------------------------------

server.tool(
  'monday_update_item',
  'Update a column value on a Monday.com item. Use change_simple_column_value for text-based updates, or change_multiple_column_values for structured JSON. Returns the updated item.',
  {
    board_id: z.string().describe('The numeric ID of the board the item belongs to (as a string)'),
    item_id: z.string().describe('The numeric ID of the item to update (as a string)'),
    column_id: z.string().optional().describe('The ID of the column to update (for single column updates)'),
    value: z.string().optional().describe('The new value for the column as a simple string (for single column updates via change_simple_column_value)'),
    column_values: z.string().optional().describe('JSON string of multiple column values to set at once (for change_multiple_column_values)'),
  },
  async ({ board_id, item_id, column_id, value, column_values }) => {
    try {
      if (column_values !== undefined) {
        // Batch update multiple columns
        const gql = `mutation UpdateColumns($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
            name
            column_values { id text value }
          }
        }`

        const result = await query(gql, {
          boardId: Number(board_id),
          itemId: Number(item_id),
          columnValues: column_values,
        })
        return successContent(result)
      } else if (column_id !== undefined && value !== undefined) {
        // Single column update
        const gql = `mutation UpdateItem($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
            name
            column_values { id text value }
          }
        }`

        const result = await query(gql, {
          boardId: Number(board_id),
          itemId: Number(item_id),
          columnId: column_id,
          value,
        })
        return successContent(result)
      } else {
        return errorContent(
          new Error('Provide either (column_id + value) for a single column update or column_values for a batch update.'),
          categoriseError,
        )
      }
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_list_items ----------------------------------------------------

server.tool(
  'monday_list_items',
  'List items on a Monday.com board. Supports pagination via cursor. Returns items with their column values.',
  {
    board_id: z.string().describe('The numeric ID of the board to list items from (as a string)'),
    limit: z.number().int().min(1).max(500).optional().describe('Number of items to return (1-500, default 25)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response to fetch the next page'),
    group_id: z.string().optional().describe('Filter items to a specific group ID'),
  },
  async ({ board_id, limit, cursor, group_id }) => {
    try {
      const itemsLimit = limit ?? 25

      if (group_id !== undefined) {
        // Query items within a specific group
        const gql = `query ListGroupItems($boardId: [ID!]!, $groupId: String!) {
          boards(ids: $boardId) {
            id
            name
            groups(ids: [$groupId]) {
              id
              title
              items_page(limit: ${itemsLimit}) {
                cursor
                items {
                  id
                  name
                  state
                  group { id title }
                  column_values { id title text value type }
                }
              }
            }
          }
        }`

        const result = await query(gql, {
          boardId: [Number(board_id)],
          groupId: group_id,
        })
        return successContent(result)
      } else if (cursor !== undefined) {
        // Continue pagination with cursor
        const gql = `query ListItemsNext($cursor: String!) {
          next_items_page(limit: ${itemsLimit}, cursor: $cursor) {
            cursor
            items {
              id
              name
              state
              group { id title }
              column_values { id title text value type }
            }
          }
        }`

        const result = await query(gql, { cursor })
        return successContent(result)
      } else {
        // Initial page
        const gql = `query ListItems($boardId: [ID!]!) {
          boards(ids: $boardId) {
            id
            name
            items_page(limit: ${itemsLimit}) {
              cursor
              items {
                id
                name
                state
                group { id title }
                column_values { id title text value type }
              }
            }
          }
        }`

        const result = await query(gql, { boardId: [Number(board_id)] })
        return successContent(result)
      }
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_create_board --------------------------------------------------

server.tool(
  'monday_create_board',
  'Create a new Monday.com board. Returns the created board object with its ID.',
  {
    board_name: z.string().describe('Name of the new board'),
    board_kind: z.enum(['public', 'private', 'share']).optional().describe('Board visibility: public (visible to all team members), private (invite only), or share (shareable). Default: public.'),
    workspace_id: z.number().optional().describe('Numeric ID of the workspace to create the board in. Omit for the default workspace.'),
    description: z.string().optional().describe('Description of the board'),
  },
  async ({ board_name, board_kind, workspace_id, description }) => {
    try {
      const vars: Record<string, unknown> = {
        boardName: board_name,
        boardKind: board_kind ?? 'public',
      }

      let gql = `mutation CreateBoard($boardName: String!, $boardKind: BoardKind!`
      if (workspace_id !== undefined) {
        gql += `, $workspaceId: ID`
        vars.workspaceId = workspace_id
      }
      if (description !== undefined) {
        gql += `, $description: String`
        vars.description = description
      }
      gql += `) {
        create_board(board_name: $boardName, board_kind: $boardKind`
      if (workspace_id !== undefined) gql += `, workspace_id: $workspaceId`
      if (description !== undefined) gql += `, description: $description`
      gql += `) {
          id
          name
          board_kind
          state
          description
        }
      }`

      const result = await query(gql, vars)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_list_boards ---------------------------------------------------

server.tool(
  'monday_list_boards',
  'List boards accessible to the authenticated Monday.com user. Supports pagination.',
  {
    limit: z.number().int().min(1).max(100).optional().describe('Number of boards to return (1-100, default 25)'),
    page: z.number().int().min(1).optional().describe('Page number for pagination (1-indexed, default 1)'),
    board_kind: z.enum(['public', 'private', 'share']).optional().describe('Filter by board visibility type'),
    workspace_id: z.number().optional().describe('Filter boards by workspace ID'),
  },
  async ({ limit, page, board_kind, workspace_id }) => {
    try {
      const boardsLimit = limit ?? 25
      const boardsPage = page ?? 1

      let filter = ''
      if (board_kind !== undefined) filter += `, board_kind: ${board_kind}`
      if (workspace_id !== undefined) filter += `, workspace_ids: [${workspace_id}]`

      const gql = `query ListBoards {
        boards(limit: ${boardsLimit}, page: ${boardsPage}${filter}) {
          id
          name
          board_kind
          state
          description
          workspace { id name }
          columns { id title type }
          groups { id title }
        }
      }`

      const result = await query(gql)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_create_column -------------------------------------------------

server.tool(
  'monday_create_column',
  'Create a new column on a Monday.com board. Returns the created column object.',
  {
    board_id: z.string().describe('The numeric ID of the board to add the column to (as a string)'),
    title: z.string().describe('Display title of the new column'),
    column_type: z.string().describe('Column type (e.g. "text", "numbers", "status", "date", "people", "dropdown", "checkbox", "link", "email", "phone", "rating", "color_picker")'),
    description: z.string().optional().describe('Description of the column'),
    defaults: z.string().optional().describe('JSON string of default values/settings for the column (varies by column type)'),
  },
  async ({ board_id, title, column_type, description, defaults }) => {
    try {
      const vars: Record<string, unknown> = {
        boardId: Number(board_id),
        title,
        columnType: column_type,
      }

      let gql = `mutation CreateColumn($boardId: ID!, $title: String!, $columnType: ColumnType!`
      if (description !== undefined) {
        gql += `, $description: String`
        vars.description = description
      }
      if (defaults !== undefined) {
        gql += `, $defaults: JSON`
        vars.defaults = defaults
      }
      gql += `) {
        create_column(board_id: $boardId, title: $title, column_type: $columnType`
      if (description !== undefined) gql += `, description: $description`
      if (defaults !== undefined) gql += `, defaults: $defaults`
      gql += `) {
          id
          title
          type
          description
        }
      }`

      const result = await query(gql, vars)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_add_update ----------------------------------------------------

server.tool(
  'monday_add_update',
  'Add an update (comment) to a Monday.com item. Updates appear in the item conversation. Returns the created update.',
  {
    item_id: z.string().describe('The numeric ID of the item to add an update to (as a string)'),
    body: z.string().describe('HTML body of the update / comment'),
    parent_id: z.string().optional().describe('The numeric ID of a parent update to reply to (as a string), creating a threaded reply'),
  },
  async ({ item_id, body, parent_id }) => {
    try {
      const vars: Record<string, unknown> = {
        itemId: Number(item_id),
        body,
      }

      let gql = `mutation AddUpdate($itemId: ID!, $body: String!`
      if (parent_id !== undefined) {
        gql += `, $parentId: ID`
        vars.parentId = Number(parent_id)
      }
      gql += `) {
        create_update(item_id: $itemId, body: $body`
      if (parent_id !== undefined) gql += `, parent_id: $parentId`
      gql += `) {
          id
          body
          created_at
          creator { id name }
        }
      }`

      const result = await query(gql, vars)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_list_updates --------------------------------------------------

server.tool(
  'monday_list_updates',
  'List updates (comments) on a Monday.com item. Returns the conversation history for the item.',
  {
    item_id: z.string().describe('The numeric ID of the item to list updates for (as a string)'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of updates to return (1-100, default 25)'),
  },
  async ({ item_id, limit }) => {
    try {
      const updatesLimit = limit ?? 25

      const gql = `query ListUpdates($itemId: [ID!]!) {
        items(ids: $itemId) {
          id
          name
          updates(limit: ${updatesLimit}) {
            id
            body
            text_body
            created_at
            updated_at
            creator { id name email }
            replies {
              id
              body
              created_at
              creator { id name }
            }
          }
        }
      }`

      const result = await query(gql, { itemId: [Number(item_id)] })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_move_item -----------------------------------------------------

server.tool(
  'monday_move_item',
  'Move a Monday.com item to a different group within the same board. Returns the updated item.',
  {
    item_id: z.string().describe('The numeric ID of the item to move (as a string)'),
    group_id: z.string().describe('The ID of the destination group to move the item to'),
  },
  async ({ item_id, group_id }) => {
    try {
      const gql = `mutation MoveItem($itemId: ID!, $groupId: String!) {
        move_item_to_group(item_id: $itemId, group_id: $groupId) {
          id
          name
          group { id title }
        }
      }`

      const result = await query(gql, {
        itemId: Number(item_id),
        groupId: group_id,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_archive_item --------------------------------------------------

server.tool(
  'monday_archive_item',
  'Archive a Monday.com item. Archived items are hidden from the board but not deleted. Returns the archived item.',
  {
    item_id: z.string().describe('The numeric ID of the item to archive (as a string)'),
  },
  async ({ item_id }) => {
    try {
      const gql = `mutation ArchiveItem($itemId: ID!) {
        archive_item(item_id: $itemId) {
          id
          name
          state
        }
      }`

      const result = await query(gql, { itemId: Number(item_id) })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- monday_search --------------------------------------------------------

server.tool(
  'monday_search',
  'Search for items on a Monday.com board by matching text in a specific column. Uses items_page_by_column_values to find items. Returns matching items.',
  {
    board_id: z.string().describe('The numeric ID of the board to search in (as a string)'),
    column_id: z.string().describe('The ID of the column to search in (e.g. "name", "text", "status")'),
    column_value: z.string().describe('The value to search for in the specified column'),
    limit: z.number().int().min(1).max(500).optional().describe('Number of results to return (1-500, default 25)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response to fetch the next page'),
  },
  async ({ board_id, column_id, column_value, limit, cursor }) => {
    try {
      const searchLimit = limit ?? 25

      if (cursor !== undefined) {
        const gql = `query SearchNext($cursor: String!) {
          next_items_page(limit: ${searchLimit}, cursor: $cursor) {
            cursor
            items {
              id
              name
              state
              group { id title }
              column_values { id title text value type }
            }
          }
        }`

        const result = await query(gql, { cursor })
        return successContent(result)
      } else {
        const gql = `query SearchItems($boardId: ID!, $columnId: String!, $columnValue: String!) {
          items_page_by_column_values(
            board_id: $boardId,
            limit: ${searchLimit},
            columns: [{ column_id: $columnId, column_values: [$columnValue] }]
          ) {
            cursor
            items {
              id
              name
              state
              group { id title }
              board { id name }
              column_values { id title text value type }
            }
          }
        }`

        const result = await query(gql, {
          boardId: Number(board_id),
          columnId: column_id,
          columnValue: column_value,
        })
        return successContent(result)
      }
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
