/**
 * Discord MCP Server -- Production-ready
 *
 * Provides tools to interact with the Discord REST API (v10) on behalf of
 * an authenticated bot.  Credentials are injected via the DISCORD_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Tools:
 *   discord_send_message    -- Send a message to a channel
 *   discord_list_channels   -- List channels in a guild
 *   discord_list_members    -- List members of a guild
 *   discord_create_channel  -- Create a new channel in a guild
 *   discord_delete_channel  -- Delete a channel
 *   discord_add_reaction    -- Add an emoji reaction to a message
 *   discord_remove_reaction -- Remove a reaction from a message
 *   discord_pin_message     -- Pin a message in a channel
 *   discord_get_user        -- Get a user by ID
 *   discord_list_roles      -- List roles in a guild
 *   discord_assign_role     -- Assign a role to a guild member
 *   discord_remove_role     -- Remove a role from a guild member
 *   discord_ban_member      -- Ban a member from a guild
 *   discord_kick_member     -- Kick a member from a guild
 *   discord_list_guilds     -- List guilds the bot is in
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'discord',
  baseUrl: 'https://discord.com/api/v10',
  tokenEnvVar: 'DISCORD_TOKEN',
  authStyle: 'bot',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'discord-mcp',
  version: '0.1.0',
})

// ---- discord_send_message -------------------------------------------------

server.tool(
  'discord_send_message',
  'Send a message to a Discord channel. Supports plain text and optional embed objects. Returns the created message.',
  {
    channel_id: z
      .string()
      .describe('The ID of the channel to send the message to'),
    content: z
      .string()
      .optional()
      .describe('Plain text message content (up to 2000 characters)'),
    embeds: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Array of embed objects to include with the message (max 10). Each embed can have title, description, color, fields, etc.'),
    tts: z
      .boolean()
      .optional()
      .describe('Whether this is a text-to-speech message (default false)'),
  },
  async ({ channel_id, content, embeds, tts }) => {
    try {
      const body: Record<string, unknown> = {}
      if (content !== undefined) body.content = content
      if (embeds !== undefined) body.embeds = embeds
      if (tts !== undefined) body.tts = tts

      const result = await call(`/channels/${channel_id}/messages`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_list_channels ------------------------------------------------

server.tool(
  'discord_list_channels',
  'List all channels in a Discord guild (server). Returns channel objects with names, types, and positions.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to list channels for'),
  },
  async ({ guild_id }) => {
    try {
      const result = await call(`/guilds/${guild_id}/channels`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_list_members -------------------------------------------------

server.tool(
  'discord_list_members',
  'List members of a Discord guild. Results are paginated via limit and after cursor.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to list members for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of members to return (1-1000, default 100)'),
    after: z
      .string()
      .optional()
      .describe('User ID cursor for pagination -- returns members after this user ID'),
  },
  async ({ guild_id, limit, after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (after !== undefined) query.after = after

      const result = await call(`/guilds/${guild_id}/members`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_create_channel -----------------------------------------------

server.tool(
  'discord_create_channel',
  'Create a new channel in a Discord guild. Returns the created channel object.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to create the channel in'),
    name: z
      .string()
      .describe('Channel name (2-100 characters, lowercase, no spaces -- use hyphens)'),
    type: z
      .number()
      .int()
      .optional()
      .describe('Channel type: 0 = text (default), 2 = voice, 4 = category, 5 = announcement, 13 = stage, 15 = forum'),
    topic: z
      .string()
      .optional()
      .describe('Channel topic (0-1024 characters for text/announcement channels)'),
    parent_id: z
      .string()
      .optional()
      .describe('ID of the parent category channel to nest this channel under'),
    nsfw: z
      .boolean()
      .optional()
      .describe('Whether the channel is NSFW (default false)'),
  },
  async ({ guild_id, name, type, topic, parent_id, nsfw }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (type !== undefined) body.type = type
      if (topic !== undefined) body.topic = topic
      if (parent_id !== undefined) body.parent_id = parent_id
      if (nsfw !== undefined) body.nsfw = nsfw

      const result = await call(`/guilds/${guild_id}/channels`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_delete_channel -----------------------------------------------

server.tool(
  'discord_delete_channel',
  'Delete a Discord channel permanently, or close a DM. Returns the deleted channel object. This action cannot be undone.',
  {
    channel_id: z
      .string()
      .describe('The ID of the channel to delete'),
  },
  async ({ channel_id }) => {
    try {
      const result = await call(`/channels/${channel_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_add_reaction -------------------------------------------------

server.tool(
  'discord_add_reaction',
  'Add an emoji reaction to a message. For Unicode emoji, use the character directly (e.g. "👍"). For custom emoji, use "name:id" format.',
  {
    channel_id: z
      .string()
      .describe('The ID of the channel containing the message'),
    message_id: z
      .string()
      .describe('The ID of the message to react to'),
    emoji: z
      .string()
      .describe('Emoji to react with. Unicode emoji character (e.g. "👍") or custom emoji in "name:id" format (e.g. "myemoji:123456")'),
  },
  async ({ channel_id, message_id, emoji }) => {
    try {
      const encodedEmoji = encodeURIComponent(emoji)
      const result = await call(
        `/channels/${channel_id}/messages/${message_id}/reactions/${encodedEmoji}/@me`,
        { method: 'PUT' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_remove_reaction ----------------------------------------------

server.tool(
  'discord_remove_reaction',
  'Remove the bot\'s own emoji reaction from a message.',
  {
    channel_id: z
      .string()
      .describe('The ID of the channel containing the message'),
    message_id: z
      .string()
      .describe('The ID of the message to remove the reaction from'),
    emoji: z
      .string()
      .describe('Emoji to remove. Unicode emoji character (e.g. "👍") or custom emoji in "name:id" format'),
  },
  async ({ channel_id, message_id, emoji }) => {
    try {
      const encodedEmoji = encodeURIComponent(emoji)
      const result = await call(
        `/channels/${channel_id}/messages/${message_id}/reactions/${encodedEmoji}/@me`,
        { method: 'DELETE' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_pin_message --------------------------------------------------

server.tool(
  'discord_pin_message',
  'Pin a message in a Discord channel. A channel can have a maximum of 50 pinned messages.',
  {
    channel_id: z
      .string()
      .describe('The ID of the channel containing the message to pin'),
    message_id: z
      .string()
      .describe('The ID of the message to pin'),
  },
  async ({ channel_id, message_id }) => {
    try {
      const result = await call(
        `/channels/${channel_id}/pins/${message_id}`,
        { method: 'PUT' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_get_user -----------------------------------------------------

server.tool(
  'discord_get_user',
  'Get detailed information about a Discord user by their ID. Returns username, discriminator, avatar, and public flags.',
  {
    user_id: z
      .string()
      .describe('The ID of the user to retrieve'),
  },
  async ({ user_id }) => {
    try {
      const result = await call(`/users/${user_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_list_roles ---------------------------------------------------

server.tool(
  'discord_list_roles',
  'List all roles in a Discord guild. Returns role objects with names, colors, permissions, and positions.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to list roles for'),
  },
  async ({ guild_id }) => {
    try {
      const result = await call(`/guilds/${guild_id}/roles`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_assign_role --------------------------------------------------

server.tool(
  'discord_assign_role',
  'Assign a role to a guild member. The bot must have the Manage Roles permission and the role must be below the bot\'s highest role.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild'),
    user_id: z
      .string()
      .describe('The ID of the user to assign the role to'),
    role_id: z
      .string()
      .describe('The ID of the role to assign'),
  },
  async ({ guild_id, user_id, role_id }) => {
    try {
      const result = await call(
        `/guilds/${guild_id}/members/${user_id}/roles/${role_id}`,
        { method: 'PUT' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_remove_role --------------------------------------------------

server.tool(
  'discord_remove_role',
  'Remove a role from a guild member. The bot must have the Manage Roles permission.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild'),
    user_id: z
      .string()
      .describe('The ID of the user to remove the role from'),
    role_id: z
      .string()
      .describe('The ID of the role to remove'),
  },
  async ({ guild_id, user_id, role_id }) => {
    try {
      const result = await call(
        `/guilds/${guild_id}/members/${user_id}/roles/${role_id}`,
        { method: 'DELETE' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_ban_member ---------------------------------------------------

server.tool(
  'discord_ban_member',
  'Ban a member from a Discord guild. Optionally delete their recent messages. The bot must have the Ban Members permission.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to ban the member from'),
    user_id: z
      .string()
      .describe('The ID of the user to ban'),
    delete_message_seconds: z
      .number()
      .int()
      .min(0)
      .max(604800)
      .optional()
      .describe('Number of seconds of messages to delete from the user (0-604800, i.e. up to 7 days)'),
    reason: z
      .string()
      .optional()
      .describe('Reason for the ban (appears in audit log)'),
  },
  async ({ guild_id, user_id, delete_message_seconds, reason }) => {
    try {
      const body: Record<string, unknown> = {}
      if (delete_message_seconds !== undefined) body.delete_message_seconds = delete_message_seconds

      const headers: Record<string, string> = {}
      if (reason) headers['X-Audit-Log-Reason'] = reason

      const result = await call(`/guilds/${guild_id}/bans/${user_id}`, {
        method: 'PUT',
        body,
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_kick_member --------------------------------------------------

server.tool(
  'discord_kick_member',
  'Kick (remove) a member from a Discord guild. The member can rejoin if they have an invite. The bot must have the Kick Members permission.',
  {
    guild_id: z
      .string()
      .describe('The ID of the guild to kick the member from'),
    user_id: z
      .string()
      .describe('The ID of the user to kick'),
    reason: z
      .string()
      .optional()
      .describe('Reason for the kick (appears in audit log)'),
  },
  async ({ guild_id, user_id, reason }) => {
    try {
      const headers: Record<string, string> = {}
      if (reason) headers['X-Audit-Log-Reason'] = reason

      const result = await call(`/guilds/${guild_id}/members/${user_id}`, {
        method: 'DELETE',
        headers,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- discord_list_guilds --------------------------------------------------

server.tool(
  'discord_list_guilds',
  'List guilds (servers) the bot is currently in. Results are paginated via limit and cursors.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum number of guilds to return (1-200, default 200)'),
    before: z
      .string()
      .optional()
      .describe('Guild ID cursor -- return guilds before this ID'),
    after: z
      .string()
      .optional()
      .describe('Guild ID cursor -- return guilds after this ID'),
  },
  async ({ limit, before, after }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (before !== undefined) query.before = before
      if (after !== undefined) query.after = after

      const result = await call('/users/@me/guilds', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
