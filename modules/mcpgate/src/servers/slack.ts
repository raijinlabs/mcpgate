/**
 * Slack MCP Server -- Production-ready
 *
 * Provides tools to interact with the Slack Web API on behalf of the
 * authenticated workspace bot.  Credentials are injected via the SLACK_TOKEN
 * environment variable (Bot User OAuth Token, set by the MCPGate gateway).
 *
 * Tools:
 *   slack_send_message      -- Post a message to a channel or thread
 *   slack_list_channels     -- List workspace channels
 *   slack_list_users        -- List workspace members
 *   slack_create_channel    -- Create a new channel
 *   slack_search_messages   -- Search messages in the workspace
 *   slack_reply_thread      -- Reply to a specific thread
 *   slack_add_reaction      -- Add an emoji reaction to a message
 *   slack_remove_reaction   -- Remove an emoji reaction from a message
 *   slack_get_user_info     -- Get detailed user profile info
 *   slack_set_topic         -- Set a channel topic
 *   slack_upload_file       -- Upload a text file to channels
 *   slack_list_files        -- List files in the workspace
 *   slack_schedule_message  -- Schedule a message for future delivery
 *   slack_archive_channel   -- Archive a channel
 *   slack_invite_to_channel -- Invite users to a channel
 *   slack_kick_from_channel -- Remove a user from a channel
 *   slack_set_status        -- Set the bot user's status
 *   slack_pin_message       -- Pin a message in a channel
 *   slack_unpin_message     -- Unpin a message from a channel
 *   slack_list_pins         -- List pinned items in a channel
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SLACK_TOKEN = process.env.SLACK_TOKEN || ''
const SLACK_API = 'https://slack.com/api'
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class SlackApiError extends Error {
  slackError: string
  httpStatus: number
  retryAfterMs?: number

  constructor(opts: {
    slackError: string
    httpStatus: number
    retryAfterMs?: number
    detail?: string
  }) {
    const tag =
      opts.slackError === 'invalid_auth' || opts.slackError === 'token_revoked' || opts.slackError === 'not_authed'
        ? 'Authentication error'
        : opts.slackError === 'ratelimited' || opts.httpStatus === 429
          ? 'Rate limit exceeded'
          : opts.httpStatus >= 500
            ? 'Slack server error'
            : 'Slack API error'
    const detail = opts.detail ? ` -- ${opts.detail}` : ''
    super(`${tag}: ${opts.slackError}${detail}`)
    this.name = 'SlackApiError'
    this.slackError = opts.slackError
    this.httpStatus = opts.httpStatus
    this.retryAfterMs = opts.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof SlackApiError) {
    const authErrors = ['invalid_auth', 'token_revoked', 'not_authed', 'account_inactive']
    if (authErrors.includes(err.slackError)) {
      return {
        message: err.message,
        hint: 'Your Slack token is invalid or revoked. Reconnect via /v1/auth/connect/slack',
      }
    }
    if (err.slackError === 'ratelimited' || err.httpStatus === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.slackError === 'missing_scope') {
      return {
        message: err.message,
        hint: 'The bot token is missing a required OAuth scope. Re-install the app with the needed scopes.',
      }
    }
    if (err.httpStatus >= 500) {
      return {
        message: err.message,
        hint: 'Slack is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}


// ---------------------------------------------------------------------------
// API helper -- Slack Web API uses POST with form / JSON bodies
// ---------------------------------------------------------------------------

async function slackApi(
  method: string,
  body: Record<string, unknown> = {},
  attempt = 0,
): Promise<unknown> {
  if (!SLACK_TOKEN) {
    throw new Error(
      'Slack token not configured. Connect via /v1/auth/connect/slack',
    )
  }

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })

  // HTTP-level rate limiting (429)
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000

    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return slackApi(method, body, attempt + 1)
    }

    throw new SlackApiError({
      slackError: 'ratelimited',
      httpStatus: 429,
      retryAfterMs: retryMs,
    })
  }

  if (!res.ok) {
    const text = await res.text()
    throw new SlackApiError({
      slackError: `http_${res.status}`,
      httpStatus: res.status,
      detail: text,
    })
  }

  const data = (await res.json()) as Record<string, unknown>

  // Slack returns 200 even on logical errors -- check the `ok` field
  if (!data.ok) {
    const slackError = typeof data.error === 'string' ? data.error : 'unknown_error'

    // Slack signals rate-limit via the body as well
    if (slackError === 'ratelimited') {
      const retryAfterSec = Number(res.headers.get('Retry-After') || '30')
      const retryMs = retryAfterSec * 1000
      if (attempt < MAX_RETRIES && retryMs <= 10_000) {
        await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
        return slackApi(method, body, attempt + 1)
      }
      throw new SlackApiError({ slackError, httpStatus: 200, retryAfterMs: retryMs })
    }

    throw new SlackApiError({ slackError, httpStatus: res.status })
  }

  return data
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'slack-mcp',
  version: '0.1.0',
})

// ---- slack_send_message ---------------------------------------------------

server.tool(
  'slack_send_message',
  'Send a message to a Slack channel or reply to a thread. Returns the posted message metadata including its timestamp ID.',
  {
    channel: z
      .string()
      .describe(
        'Channel ID (e.g. C0123456789) or channel name (e.g. #general) to post to',
      ),
    text: z.string().describe('Message text. Supports Slack mrkdwn formatting.'),
    thread_ts: z
      .string()
      .optional()
      .describe(
        'Timestamp of a parent message to reply to, creating or continuing a thread',
      ),
  },
  async ({ channel, text, thread_ts }) => {
    try {
      const body: Record<string, unknown> = { channel, text }
      if (thread_ts !== undefined) body.thread_ts = thread_ts

      const result = await slackApi('chat.postMessage', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_list_channels --------------------------------------------------

server.tool(
  'slack_list_channels',
  'List channels in the Slack workspace. Can filter by channel type. Returns channel IDs, names, and metadata.',
  {
    types: z
      .string()
      .optional()
      .describe(
        'Comma-separated channel types to include: public_channel, private_channel, mpim, im (default: public_channel)',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of channels to return (1-1000, default 100)'),
  },
  async ({ types, limit }) => {
    try {
      const body: Record<string, unknown> = {}
      if (types !== undefined) body.types = types
      if (limit !== undefined) body.limit = limit

      const result = await slackApi('conversations.list', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_list_users -----------------------------------------------------

server.tool(
  'slack_list_users',
  'List members of the Slack workspace. Returns user profiles including display name, email, and status.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Maximum number of users to return (1-1000, default 100)'),
  },
  async ({ limit }) => {
    try {
      const body: Record<string, unknown> = {}
      if (limit !== undefined) body.limit = limit

      const result = await slackApi('users.list', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_create_channel -------------------------------------------------

server.tool(
  'slack_create_channel',
  'Create a new Slack channel. Returns the created channel object with its ID and metadata.',
  {
    name: z
      .string()
      .describe(
        'Channel name (lowercase, no spaces, max 80 chars). Use hyphens instead of spaces.',
      ),
    is_private: z
      .boolean()
      .optional()
      .describe('If true, create a private channel. Defaults to false (public).'),
  },
  async ({ name, is_private }) => {
    try {
      const body: Record<string, unknown> = { name }
      if (is_private !== undefined) body.is_private = is_private

      const result = await slackApi('conversations.create', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_search_messages ------------------------------------------------

server.tool(
  'slack_search_messages',
  'Search for messages in the Slack workspace. Requires a user token with search:read scope. Returns matching messages with context.',
  {
    query: z
      .string()
      .describe(
        'Search query string. Supports Slack search modifiers like "from:@user", "in:#channel", "has:link".',
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of results to return per page (1-100, default 20)'),
  },
  async ({ query, count }) => {
    try {
      const body: Record<string, unknown> = { query }
      if (count !== undefined) body.count = count

      const result = await slackApi('search.messages', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_reply_thread ---------------------------------------------------

server.tool(
  'slack_reply_thread',
  'Reply to a specific thread in a Slack channel. The thread_ts identifies the parent message. Optionally broadcast the reply to the channel.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) where the thread lives'),
    thread_ts: z
      .string()
      .describe('Timestamp of the parent message to reply to'),
    text: z.string().describe('Reply text. Supports Slack mrkdwn formatting.'),
    reply_broadcast: z
      .boolean()
      .optional()
      .describe(
        'If true, the reply will also be posted to the channel as a normal message. Defaults to false.',
      ),
  },
  async ({ channel, thread_ts, text, reply_broadcast }) => {
    try {
      const body: Record<string, unknown> = { channel, thread_ts, text }
      if (reply_broadcast !== undefined) body.reply_broadcast = reply_broadcast

      const result = await slackApi('chat.postMessage', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_add_reaction ---------------------------------------------------

server.tool(
  'slack_add_reaction',
  'Add an emoji reaction to a message. The emoji name should be provided without surrounding colons.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) containing the message'),
    timestamp: z
      .string()
      .describe('Timestamp of the message to react to'),
    name: z
      .string()
      .describe('Emoji name without colons (e.g. "thumbsup", "white_check_mark")'),
  },
  async ({ channel, timestamp, name }) => {
    try {
      const result = await slackApi('reactions.add', { channel, timestamp, name })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_remove_reaction ------------------------------------------------

server.tool(
  'slack_remove_reaction',
  'Remove an emoji reaction from a message. The emoji name should be provided without surrounding colons.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) containing the message'),
    timestamp: z
      .string()
      .describe('Timestamp of the message to remove the reaction from'),
    name: z
      .string()
      .describe('Emoji name without colons (e.g. "thumbsup", "white_check_mark")'),
  },
  async ({ channel, timestamp, name }) => {
    try {
      const result = await slackApi('reactions.remove', { channel, timestamp, name })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_get_user_info --------------------------------------------------

server.tool(
  'slack_get_user_info',
  'Get detailed profile information for a single Slack user. Returns display name, email, status, timezone, and more.',
  {
    user: z
      .string()
      .describe('User ID (e.g. U0123456789) to look up'),
  },
  async ({ user }) => {
    try {
      const result = await slackApi('users.info', { user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_set_topic ------------------------------------------------------

server.tool(
  'slack_set_topic',
  'Set the topic of a Slack channel. The topic appears in the channel header.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to set the topic for'),
    topic: z
      .string()
      .describe('New topic text for the channel'),
  },
  async ({ channel, topic }) => {
    try {
      const result = await slackApi('conversations.setTopic', { channel, topic })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_upload_file ----------------------------------------------------

server.tool(
  'slack_upload_file',
  'Upload a text file to one or more Slack channels. Uses the legacy files.upload endpoint which accepts file content as a text field.',
  {
    channels: z
      .string()
      .describe('Comma-separated channel IDs (e.g. "C0123456789,C9876543210") to share the file in'),
    content: z
      .string()
      .describe('File content as text'),
    filename: z
      .string()
      .describe('Name of the file (e.g. "report.txt", "data.csv")'),
    title: z
      .string()
      .optional()
      .describe('Title of the file displayed in Slack'),
    filetype: z
      .string()
      .optional()
      .describe('File type identifier (e.g. "text", "csv", "javascript"). See Slack docs for full list.'),
  },
  async ({ channels, content, filename, title, filetype }) => {
    try {
      const body: Record<string, unknown> = { channels, content, filename }
      if (title !== undefined) body.title = title
      if (filetype !== undefined) body.filetype = filetype

      const result = await slackApi('files.upload', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_list_files -----------------------------------------------------

server.tool(
  'slack_list_files',
  'List files shared in the workspace. Can filter by channel or user. Returns file metadata including URLs.',
  {
    channel: z
      .string()
      .optional()
      .describe('Channel ID to filter files by (e.g. C0123456789)'),
    user: z
      .string()
      .optional()
      .describe('User ID to filter files by (e.g. U0123456789)'),
    count: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of files to return (1-100, default 20)'),
  },
  async ({ channel, user, count }) => {
    try {
      const body: Record<string, unknown> = {}
      if (channel !== undefined) body.channel = channel
      if (user !== undefined) body.user = user
      if (count !== undefined) body.count = count

      const result = await slackApi('files.list', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_schedule_message -----------------------------------------------

server.tool(
  'slack_schedule_message',
  'Schedule a message to be sent at a future time. Returns the scheduled message ID which can be used to delete it before it sends.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to send the scheduled message to'),
    text: z
      .string()
      .describe('Message text. Supports Slack mrkdwn formatting.'),
    post_at: z
      .number()
      .describe('Unix timestamp (seconds) for when the message should be sent'),
    thread_ts: z
      .string()
      .optional()
      .describe('Timestamp of a parent message to reply to as a scheduled thread reply'),
  },
  async ({ channel, text, post_at, thread_ts }) => {
    try {
      const body: Record<string, unknown> = { channel, text, post_at }
      if (thread_ts !== undefined) body.thread_ts = thread_ts

      const result = await slackApi('chat.scheduleMessage', body)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_archive_channel ------------------------------------------------

server.tool(
  'slack_archive_channel',
  'Archive a Slack channel. Archived channels are hidden from the channel list and become read-only.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to archive'),
  },
  async ({ channel }) => {
    try {
      const result = await slackApi('conversations.archive', { channel })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_invite_to_channel ----------------------------------------------

server.tool(
  'slack_invite_to_channel',
  'Invite one or more users to a Slack channel. Users are specified as a comma-separated list of user IDs.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to invite users to'),
    users: z
      .string()
      .describe('Comma-separated user IDs (e.g. "U0123456789,U9876543210") to invite'),
  },
  async ({ channel, users }) => {
    try {
      const result = await slackApi('conversations.invite', { channel, users })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_kick_from_channel ----------------------------------------------

server.tool(
  'slack_kick_from_channel',
  'Remove a user from a Slack channel. The bot must be a member of the channel and have appropriate permissions.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to remove the user from'),
    user: z
      .string()
      .describe('User ID (e.g. U0123456789) to remove from the channel'),
  },
  async ({ channel, user }) => {
    try {
      const result = await slackApi('conversations.kick', { channel, user })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_set_status -----------------------------------------------------

server.tool(
  'slack_set_status',
  'Set the status of the authenticated user. Includes status text, an optional emoji, and an optional expiration time.',
  {
    status_text: z
      .string()
      .describe('Status text to display (e.g. "In a meeting", "On vacation")'),
    status_emoji: z
      .string()
      .optional()
      .describe('Status emoji using colon syntax (e.g. ":coffee:", ":palm_tree:")'),
    expiration: z
      .number()
      .optional()
      .describe(
        'Unix timestamp (seconds) for when the status should expire. Use 0 for no expiration.',
      ),
  },
  async ({ status_text, status_emoji, expiration }) => {
    try {
      const profile: Record<string, unknown> = { status_text }
      if (status_emoji !== undefined) profile.status_emoji = status_emoji
      if (expiration !== undefined) profile.status_expiration = expiration

      const result = await slackApi('users.profile.set', { profile })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_pin_message ----------------------------------------------------

server.tool(
  'slack_pin_message',
  'Pin a message to a Slack channel. Pinned messages are highlighted and easily accessible from the channel details.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) containing the message to pin'),
    timestamp: z
      .string()
      .describe('Timestamp of the message to pin'),
  },
  async ({ channel, timestamp }) => {
    try {
      const result = await slackApi('pins.add', { channel, timestamp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_unpin_message --------------------------------------------------

server.tool(
  'slack_unpin_message',
  'Unpin a message from a Slack channel.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) containing the message to unpin'),
    timestamp: z
      .string()
      .describe('Timestamp of the message to unpin'),
  },
  async ({ channel, timestamp }) => {
    try {
      const result = await slackApi('pins.remove', { channel, timestamp })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- slack_list_pins ------------------------------------------------------

server.tool(
  'slack_list_pins',
  'List all pinned items in a Slack channel. Returns pinned messages and files with their metadata.',
  {
    channel: z
      .string()
      .describe('Channel ID (e.g. C0123456789) to list pinned items for'),
  },
  async ({ channel }) => {
    try {
      const result = await slackApi('pins.list', { channel })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
