/**
 * Microsoft Teams MCP Server -- Production-ready
 *
 * Provides tools to interact with the Microsoft Graph API (v1.0) for
 * Teams-related operations on behalf of the authenticated user.  Credentials
 * are injected via the MICROSOFT_TOKEN environment variable (OAuth2 access
 * token, set by the MCPGate gateway).
 *
 * Tools:
 *   teams_send_message      -- Send a message to a channel
 *   teams_list_channels     -- List channels in a team
 *   teams_create_channel    -- Create a new channel in a team
 *   teams_list_teams        -- List teams the user is a member of
 *   teams_list_members      -- List members of a team
 *   teams_reply_message     -- Reply to a channel message
 *   teams_list_chats        -- List chats for the authenticated user
 *   teams_send_chat_message -- Send a message in a 1:1 or group chat
 *   teams_get_channel       -- Get details of a single channel
 *   teams_update_channel    -- Update a channel's name or description
 *   teams_delete_channel    -- Delete a channel
 *   teams_list_messages     -- List messages in a channel
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'microsoft-teams',
  baseUrl: 'https://graph.microsoft.com/v1.0',
  tokenEnvVar: 'MICROSOFT_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'microsoft-teams-mcp',
  version: '0.1.0',
})

// ---- teams_send_message ---------------------------------------------------

server.tool(
  'teams_send_message',
  'Send a message to a Microsoft Teams channel. Supports plain text and HTML content. Returns the created message object.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel to send the message to'),
    content: z
      .string()
      .describe('Message content text'),
    content_type: z
      .enum(['text', 'html'])
      .optional()
      .describe('Content type of the message body: "text" (default) or "html"'),
  },
  async ({ team_id, channel_id, content, content_type }) => {
    try {
      const body: Record<string, unknown> = {
        body: {
          content,
          contentType: content_type || 'text',
        },
      }

      const result = await call(
        `/teams/${team_id}/channels/${channel_id}/messages`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_list_channels --------------------------------------------------

server.tool(
  'teams_list_channels',
  'List all channels in a Microsoft Teams team. Returns channel IDs, display names, and descriptions.',
  {
    team_id: z
      .string()
      .describe('The ID of the team to list channels for'),
    filter: z
      .string()
      .optional()
      .describe('OData $filter expression to filter channels (e.g. "membershipType eq \'standard\'")'),
  },
  async ({ team_id, filter }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter) query['$filter'] = filter

      const result = await call(`/teams/${team_id}/channels`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_create_channel -------------------------------------------------

server.tool(
  'teams_create_channel',
  'Create a new channel in a Microsoft Teams team. Returns the created channel object.',
  {
    team_id: z
      .string()
      .describe('The ID of the team to create the channel in'),
    display_name: z
      .string()
      .describe('Display name for the new channel (must be unique within the team)'),
    description: z
      .string()
      .optional()
      .describe('Optional description for the channel'),
    membership_type: z
      .enum(['standard', 'private', 'shared'])
      .optional()
      .describe('Channel membership type: standard (default), private, or shared'),
  },
  async ({ team_id, display_name, description, membership_type }) => {
    try {
      const body: Record<string, unknown> = { displayName: display_name }
      if (description !== undefined) body.description = description
      if (membership_type !== undefined) body.membershipType = membership_type

      const result = await call(`/teams/${team_id}/channels`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_list_teams -----------------------------------------------------

server.tool(
  'teams_list_teams',
  'List Microsoft Teams teams that the authenticated user is a member of. Returns team IDs, display names, and descriptions.',
  {
    filter: z
      .string()
      .optional()
      .describe('OData $filter expression to filter teams'),
    top: z
      .number()
      .int()
      .min(1)
      .max(999)
      .optional()
      .describe('Maximum number of teams to return (1-999)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of teams to skip for pagination'),
  },
  async ({ filter, top, skip }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (filter) query['$filter'] = filter
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)

      const result = await call('/me/joinedTeams', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_list_members ---------------------------------------------------

server.tool(
  'teams_list_members',
  'List members of a Microsoft Teams team. Returns member display names, roles, and email addresses.',
  {
    team_id: z
      .string()
      .describe('The ID of the team to list members for'),
    top: z
      .number()
      .int()
      .min(1)
      .max(999)
      .optional()
      .describe('Maximum number of members to return (1-999)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of members to skip for pagination'),
  },
  async ({ team_id, top, skip }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)

      const result = await call(`/teams/${team_id}/members`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_reply_message --------------------------------------------------

server.tool(
  'teams_reply_message',
  'Reply to a message in a Microsoft Teams channel. Creates a threaded reply under the specified parent message.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel containing the message'),
    message_id: z
      .string()
      .describe('The ID of the parent message to reply to'),
    content: z
      .string()
      .describe('Reply content text'),
    content_type: z
      .enum(['text', 'html'])
      .optional()
      .describe('Content type of the reply body: "text" (default) or "html"'),
  },
  async ({ team_id, channel_id, message_id, content, content_type }) => {
    try {
      const body: Record<string, unknown> = {
        body: {
          content,
          contentType: content_type || 'text',
        },
      }

      const result = await call(
        `/teams/${team_id}/channels/${channel_id}/messages/${message_id}/replies`,
        { method: 'POST', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_list_chats -----------------------------------------------------

server.tool(
  'teams_list_chats',
  'List chats for the authenticated user. Includes 1:1 chats, group chats, and meeting chats.',
  {
    top: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of chats to return (1-50, default 50)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of chats to skip for pagination'),
    filter: z
      .string()
      .optional()
      .describe('OData $filter expression to filter chats (e.g. "chatType eq \'oneOnOne\'")'),
  },
  async ({ top, skip, filter }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)
      if (filter) query['$filter'] = filter

      const result = await call('/me/chats', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_send_chat_message ----------------------------------------------

server.tool(
  'teams_send_chat_message',
  'Send a message in a 1:1 or group chat. Returns the created message object.',
  {
    chat_id: z
      .string()
      .describe('The ID of the chat to send the message to'),
    content: z
      .string()
      .describe('Message content text'),
    content_type: z
      .enum(['text', 'html'])
      .optional()
      .describe('Content type of the message body: "text" (default) or "html"'),
  },
  async ({ chat_id, content, content_type }) => {
    try {
      const body: Record<string, unknown> = {
        body: {
          content,
          contentType: content_type || 'text',
        },
      }

      const result = await call(`/chats/${chat_id}/messages`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_get_channel ----------------------------------------------------

server.tool(
  'teams_get_channel',
  'Get detailed information about a single Microsoft Teams channel including its display name, description, and membership type.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel to retrieve'),
  },
  async ({ team_id, channel_id }) => {
    try {
      const result = await call(`/teams/${team_id}/channels/${channel_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_update_channel -------------------------------------------------

server.tool(
  'teams_update_channel',
  'Update a Microsoft Teams channel\'s display name or description. Returns the updated channel object.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel to update'),
    display_name: z
      .string()
      .optional()
      .describe('New display name for the channel'),
    description: z
      .string()
      .optional()
      .describe('New description for the channel (set to empty string to clear)'),
  },
  async ({ team_id, channel_id, display_name, description }) => {
    try {
      const body: Record<string, unknown> = {}
      if (display_name !== undefined) body.displayName = display_name
      if (description !== undefined) body.description = description

      const result = await call(`/teams/${team_id}/channels/${channel_id}`, {
        method: 'PATCH',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_delete_channel -------------------------------------------------

server.tool(
  'teams_delete_channel',
  'Delete a Microsoft Teams channel. Only custom channels can be deleted; the General channel cannot be deleted. This action cannot be undone.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel to delete'),
  },
  async ({ team_id, channel_id }) => {
    try {
      const result = await call(`/teams/${team_id}/channels/${channel_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- teams_list_messages --------------------------------------------------

server.tool(
  'teams_list_messages',
  'List messages in a Microsoft Teams channel. Returns message content, sender info, and timestamps. Results are paginated.',
  {
    team_id: z
      .string()
      .describe('The ID of the team containing the channel'),
    channel_id: z
      .string()
      .describe('The ID of the channel to list messages for'),
    top: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of messages to return (1-50, default 20)'),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of messages to skip for pagination'),
  },
  async ({ team_id, channel_id, top, skip }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (top !== undefined) query['$top'] = String(top)
      if (skip !== undefined) query['$skip'] = String(skip)

      const result = await call(
        `/teams/${team_id}/channels/${channel_id}/messages`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
