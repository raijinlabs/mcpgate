/**
 * Telegram MCP Server -- Production-ready
 *
 * Provides tools to interact with the Telegram Bot API on behalf of a bot.
 * Credentials are injected via the TELEGRAM_TOKEN environment variable
 * (Bot token from @BotFather, set by the MCPGate gateway).
 *
 * Telegram uses a unique auth pattern where the bot token is embedded in the
 * URL path (`/bot{token}/{method}`), so this server uses a custom API helper
 * instead of createApiClient.
 *
 * Tools:
 *   telegram_send_message      -- Send a text message to a chat
 *   telegram_get_updates       -- Get incoming updates (messages, callbacks, etc.)
 *   telegram_send_photo        -- Send a photo to a chat
 *   telegram_send_document     -- Send a document/file to a chat
 *   telegram_get_chat          -- Get information about a chat
 *   telegram_list_chat_members -- Get member count and list of administrators
 *   telegram_pin_message       -- Pin a message in a chat
 *   telegram_unpin_message     -- Unpin a message in a chat
 *   telegram_set_chat_title    -- Set the title of a chat
 *   telegram_delete_message    -- Delete a message
 *   telegram_forward_message   -- Forward a message to another chat
 *   telegram_edit_message      -- Edit a previously sent message
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TELEGRAM_API = 'https://api.telegram.org'
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class TelegramApiError extends Error {
  status: number
  errorCode: number
  retryAfterMs?: number

  constructor(opts: {
    description: string
    httpStatus: number
    errorCode: number
    retryAfterMs?: number
  }) {
    const tag =
      opts.errorCode === 401
        ? 'Authentication error'
        : opts.errorCode === 429 || opts.httpStatus === 429
          ? 'Rate limit exceeded'
          : opts.httpStatus >= 500
            ? 'Telegram server error'
            : 'Telegram API error'
    super(`${tag} (${opts.errorCode}): ${opts.description}`)
    this.name = 'TelegramApiError'
    this.status = opts.httpStatus
    this.errorCode = opts.errorCode
    this.retryAfterMs = opts.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof TelegramApiError) {
    if (err.errorCode === 401) {
      return {
        message: err.message,
        hint: 'Your Telegram bot token is invalid. Reconnect via /v1/auth/connect/telegram',
      }
    }
    if (err.errorCode === 429 || err.status === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Telegram is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// Custom Telegram API helper
// ---------------------------------------------------------------------------

async function telegramApi(
  method: string,
  params: Record<string, unknown> = {},
  attempt = 0,
): Promise<unknown> {
  const token = process.env.TELEGRAM_TOKEN || ''
  if (!token) {
    throw new Error(
      'Telegram bot token not configured. Connect via /v1/auth/connect/telegram',
    )
  }

  const url = `${TELEGRAM_API}/bot${token}/${method}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  const data = (await res.json()) as Record<string, unknown>

  // Telegram returns { ok: true/false, result: ..., description: ... }
  if (!data.ok) {
    const description = typeof data.description === 'string' ? data.description : 'Unknown error'
    const errorCode = typeof data.error_code === 'number' ? data.error_code : res.status

    // Rate-limit retry
    if (errorCode === 429) {
      const retryAfterSec =
        typeof (data.parameters as Record<string, unknown> | undefined)?.retry_after === 'number'
          ? (data.parameters as Record<string, number>).retry_after
          : 30
      const retryMs = retryAfterSec * 1000

      if (attempt < MAX_RETRIES && retryMs <= 10_000) {
        await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
        return telegramApi(method, params, attempt + 1)
      }

      throw new TelegramApiError({
        description,
        httpStatus: res.status,
        errorCode,
        retryAfterMs: retryMs,
      })
    }

    throw new TelegramApiError({
      description,
      httpStatus: res.status,
      errorCode,
    })
  }

  return data.result
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'telegram-mcp',
  version: '0.1.0',
})

// ---- telegram_send_message ------------------------------------------------

server.tool(
  'telegram_send_message',
  'Send a text message to a Telegram chat. Supports Markdown and HTML formatting. Returns the sent message object.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel (e.g. @channelusername)'),
    text: z
      .string()
      .describe('Text of the message to send (1-4096 characters)'),
    parse_mode: z
      .enum(['MarkdownV2', 'HTML', 'Markdown'])
      .optional()
      .describe('Text parsing mode: MarkdownV2, HTML, or Markdown (legacy)'),
    disable_web_page_preview: z
      .boolean()
      .optional()
      .describe('Disables link previews for links in the message (default false)'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('Sends the message silently -- users will receive a notification with no sound (default false)'),
    reply_to_message_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the message to reply to in the same chat'),
  },
  async ({ chat_id, text, parse_mode, disable_web_page_preview, disable_notification, reply_to_message_id }) => {
    try {
      const params: Record<string, unknown> = { chat_id, text }
      if (parse_mode !== undefined) params.parse_mode = parse_mode
      if (disable_web_page_preview !== undefined) params.disable_web_page_preview = disable_web_page_preview
      if (disable_notification !== undefined) params.disable_notification = disable_notification
      if (reply_to_message_id !== undefined) params.reply_to_message_id = reply_to_message_id

      const result = await telegramApi('sendMessage', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_get_updates -------------------------------------------------

server.tool(
  'telegram_get_updates',
  'Get incoming updates for the bot using long polling. Returns an array of Update objects (messages, edited messages, callbacks, etc.).',
  {
    offset: z
      .number()
      .int()
      .optional()
      .describe('Identifier of the first update to be returned. Use last update_id + 1 to acknowledge previous updates.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of updates to retrieve (1-100, default 100)'),
    timeout: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Timeout in seconds for long polling (0 for short polling, default 0)'),
    allowed_updates: z
      .array(z.string())
      .optional()
      .describe('List of update types to receive (e.g. ["message", "callback_query"]). Empty list for all types.'),
  },
  async ({ offset, limit, timeout, allowed_updates }) => {
    try {
      const params: Record<string, unknown> = {}
      if (offset !== undefined) params.offset = offset
      if (limit !== undefined) params.limit = limit
      if (timeout !== undefined) params.timeout = timeout
      if (allowed_updates !== undefined) params.allowed_updates = allowed_updates

      const result = await telegramApi('getUpdates', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_send_photo --------------------------------------------------

server.tool(
  'telegram_send_photo',
  'Send a photo to a Telegram chat. The photo can be specified as a URL or a file_id of an already uploaded photo.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    photo: z
      .string()
      .describe('Photo to send: a URL (http/https) or file_id of an existing photo on Telegram servers'),
    caption: z
      .string()
      .optional()
      .describe('Photo caption (0-1024 characters)'),
    parse_mode: z
      .enum(['MarkdownV2', 'HTML', 'Markdown'])
      .optional()
      .describe('Parsing mode for the caption: MarkdownV2, HTML, or Markdown'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('Sends the photo silently (default false)'),
    reply_to_message_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the message to reply to'),
  },
  async ({ chat_id, photo, caption, parse_mode, disable_notification, reply_to_message_id }) => {
    try {
      const params: Record<string, unknown> = { chat_id, photo }
      if (caption !== undefined) params.caption = caption
      if (parse_mode !== undefined) params.parse_mode = parse_mode
      if (disable_notification !== undefined) params.disable_notification = disable_notification
      if (reply_to_message_id !== undefined) params.reply_to_message_id = reply_to_message_id

      const result = await telegramApi('sendPhoto', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_send_document -----------------------------------------------

server.tool(
  'telegram_send_document',
  'Send a document/file to a Telegram chat. The document can be specified as a URL or a file_id of an already uploaded file.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    document: z
      .string()
      .describe('Document to send: a URL (http/https) or file_id of an existing file on Telegram servers'),
    caption: z
      .string()
      .optional()
      .describe('Document caption (0-1024 characters)'),
    parse_mode: z
      .enum(['MarkdownV2', 'HTML', 'Markdown'])
      .optional()
      .describe('Parsing mode for the caption: MarkdownV2, HTML, or Markdown'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('Sends the document silently (default false)'),
    reply_to_message_id: z
      .number()
      .int()
      .optional()
      .describe('ID of the message to reply to'),
  },
  async ({ chat_id, document, caption, parse_mode, disable_notification, reply_to_message_id }) => {
    try {
      const params: Record<string, unknown> = { chat_id, document }
      if (caption !== undefined) params.caption = caption
      if (parse_mode !== undefined) params.parse_mode = parse_mode
      if (disable_notification !== undefined) params.disable_notification = disable_notification
      if (reply_to_message_id !== undefined) params.reply_to_message_id = reply_to_message_id

      const result = await telegramApi('sendDocument', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_get_chat ----------------------------------------------------

server.tool(
  'telegram_get_chat',
  'Get information about a Telegram chat. Returns chat type, title, description, member count, and other metadata.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target supergroup/channel (e.g. @channelusername)'),
  },
  async ({ chat_id }) => {
    try {
      const result = await telegramApi('getChat', { chat_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_list_chat_members -------------------------------------------

server.tool(
  'telegram_list_chat_members',
  'Get the member count and list of administrators for a Telegram chat. Returns both the total member count and an array of admin ChatMember objects.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target supergroup/channel'),
  },
  async ({ chat_id }) => {
    try {
      const [memberCount, administrators] = await Promise.all([
        telegramApi('getChatMemberCount', { chat_id }),
        telegramApi('getChatAdministrators', { chat_id }),
      ])

      return successContent({
        member_count: memberCount,
        administrators,
      })
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_pin_message -------------------------------------------------

server.tool(
  'telegram_pin_message',
  'Pin a message in a Telegram chat. The bot must have the appropriate admin rights in the chat.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    message_id: z
      .number()
      .int()
      .describe('Identifier of the message to pin'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('If true, do not send a notification to all chat members about the pinned message (default false)'),
  },
  async ({ chat_id, message_id, disable_notification }) => {
    try {
      const params: Record<string, unknown> = { chat_id, message_id }
      if (disable_notification !== undefined) params.disable_notification = disable_notification

      const result = await telegramApi('pinChatMessage', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_unpin_message -----------------------------------------------

server.tool(
  'telegram_unpin_message',
  'Unpin a message in a Telegram chat. If message_id is not provided, the most recent pinned message is unpinned.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    message_id: z
      .number()
      .int()
      .optional()
      .describe('Identifier of the message to unpin. If omitted, the most recent pinned message is unpinned.'),
  },
  async ({ chat_id, message_id }) => {
    try {
      const params: Record<string, unknown> = { chat_id }
      if (message_id !== undefined) params.message_id = message_id

      const result = await telegramApi('unpinChatMessage', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_set_chat_title ----------------------------------------------

server.tool(
  'telegram_set_chat_title',
  'Set the title of a Telegram group, supergroup, or channel. The bot must have the appropriate admin rights.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    title: z
      .string()
      .describe('New chat title (1-128 characters)'),
  },
  async ({ chat_id, title }) => {
    try {
      const result = await telegramApi('setChatTitle', { chat_id, title })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_delete_message ----------------------------------------------

server.tool(
  'telegram_delete_message',
  'Delete a message from a Telegram chat. The bot must have the appropriate permissions. Messages can only be deleted within 48 hours in private chats with the bot.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    message_id: z
      .number()
      .int()
      .describe('Identifier of the message to delete'),
  },
  async ({ chat_id, message_id }) => {
    try {
      const result = await telegramApi('deleteMessage', { chat_id, message_id })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_forward_message ---------------------------------------------

server.tool(
  'telegram_forward_message',
  'Forward a message from one Telegram chat to another. The original sender attribution is preserved.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Target chat ID or username to forward the message to'),
    from_chat_id: z
      .union([z.string(), z.number()])
      .describe('Source chat ID or username where the original message was sent'),
    message_id: z
      .number()
      .int()
      .describe('Message identifier in the source chat to forward'),
    disable_notification: z
      .boolean()
      .optional()
      .describe('Sends the forwarded message silently (default false)'),
  },
  async ({ chat_id, from_chat_id, message_id, disable_notification }) => {
    try {
      const params: Record<string, unknown> = { chat_id, from_chat_id, message_id }
      if (disable_notification !== undefined) params.disable_notification = disable_notification

      const result = await telegramApi('forwardMessage', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- telegram_edit_message ------------------------------------------------

server.tool(
  'telegram_edit_message',
  'Edit the text of a previously sent message. The bot can only edit messages it has sent, or messages in channels where it is an admin.',
  {
    chat_id: z
      .union([z.string(), z.number()])
      .describe('Unique identifier for the target chat, or username of the target channel'),
    message_id: z
      .number()
      .int()
      .describe('Identifier of the message to edit'),
    text: z
      .string()
      .describe('New text of the message (1-4096 characters)'),
    parse_mode: z
      .enum(['MarkdownV2', 'HTML', 'Markdown'])
      .optional()
      .describe('Parsing mode for the new text: MarkdownV2, HTML, or Markdown'),
    disable_web_page_preview: z
      .boolean()
      .optional()
      .describe('Disables link previews for links in the edited message'),
  },
  async ({ chat_id, message_id, text, parse_mode, disable_web_page_preview }) => {
    try {
      const params: Record<string, unknown> = { chat_id, message_id, text }
      if (parse_mode !== undefined) params.parse_mode = parse_mode
      if (disable_web_page_preview !== undefined) params.disable_web_page_preview = disable_web_page_preview

      const result = await telegramApi('editMessageText', params)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
