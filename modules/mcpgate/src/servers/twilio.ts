/**
 * Twilio MCP Server -- Production-ready
 *
 * Provides tools to interact with the Twilio REST API on behalf of the
 * authenticated user.  Credentials are injected via the TWILIO_ACCOUNT_SID
 * and TWILIO_AUTH_TOKEN environment variables (set by the MCPGate gateway).
 *
 * Twilio uses HTTP Basic authentication (base64 of accountSid:authToken)
 * and application/x-www-form-urlencoded POST bodies.
 *
 * Tools:
 *   twilio_send_sms          -- Send an SMS message
 *   twilio_list_messages     -- List SMS messages
 *   twilio_get_message       -- Get a single message by SID
 *   twilio_make_call         -- Initiate a phone call
 *   twilio_list_calls        -- List phone calls
 *   twilio_get_call          -- Get a single call by SID
 *   twilio_list_phone_numbers -- List phone numbers on the account
 *   twilio_get_account       -- Get account information
 *   twilio_list_recordings   -- List recordings
 *   twilio_get_usage         -- Get usage records
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class TwilioApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(detail: { status: number; body: string; retryAfterMs?: number }) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status >= 500
            ? 'Twilio server error'
            : 'Twilio API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'TwilioApiError'
    this.status = detail.status
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof TwilioApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Twilio credentials may be invalid. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN or reconnect via /v1/auth/connect/twilio',
      }
    }
    if (err.status === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Twilio is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// API helper with Basic auth and form-urlencoded body
// ---------------------------------------------------------------------------

function getAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID || ''
  if (!sid) {
    throw new Error(
      'TWILIO_ACCOUNT_SID not configured. Set it or connect via /v1/auth/connect/twilio',
    )
  }
  return sid
}

function getBasicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID || ''
  const token = process.env.TWILIO_AUTH_TOKEN || ''
  if (!sid || !token) {
    throw new Error(
      'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN or connect via /v1/auth/connect/twilio',
    )
  }
  return Buffer.from(`${sid}:${token}`).toString('base64')
}

async function twilioApi(
  path: string,
  opts: {
    method?: string
    body?: Record<string, string>
    query?: Record<string, string>
  } = {},
  attempt = 0,
): Promise<unknown> {
  const accountSid = getAccountSid()
  const basicAuth = getBasicAuth()
  const method = opts.method || 'GET'
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`

  let url = `${baseUrl}${path}`
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
  }

  let bodyStr: string | undefined
  if (opts.body && (method === 'POST' || method === 'PUT')) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    bodyStr = new URLSearchParams(
      Object.entries(opts.body).filter(([, v]) => v !== undefined),
    ).toString()
  }

  const res = await fetch(url, { method, headers, body: bodyStr })

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000
    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) => setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)))
      return twilioApi(path, opts, attempt + 1)
    }
    const body = await res.text()
    throw new TwilioApiError({ status: 429, body, retryAfterMs: retryMs })
  }

  if (!res.ok) {
    const body = await res.text()
    throw new TwilioApiError({ status: res.status, body })
  }

  if (res.status === 204) return {}
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'twilio-mcp',
  version: '0.1.0',
})

// ---- twilio_send_sms ------------------------------------------------------

server.tool(
  'twilio_send_sms',
  'Send an SMS message via Twilio. Returns the created message object with SID, status, and delivery details.',
  {
    to: z.string().describe('Destination phone number in E.164 format (e.g. "+15551234567")'),
    from: z.string().describe('Twilio phone number to send from in E.164 format (e.g. "+15559876543")'),
    body: z.string().describe('Text body of the SMS message (max 1600 characters)'),
    status_callback: z
      .string()
      .optional()
      .describe('URL to receive delivery status webhooks'),
  },
  async ({ to, from, body, status_callback }) => {
    try {
      const formBody: Record<string, string> = { To: to, From: from, Body: body }
      if (status_callback) formBody.StatusCallback = status_callback

      const result = await twilioApi('/Messages.json', {
        method: 'POST',
        body: formBody,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_list_messages -------------------------------------------------

server.tool(
  'twilio_list_messages',
  'List SMS messages on the Twilio account. Results are paginated and can be filtered by sender, recipient, or date.',
  {
    to: z.string().optional().describe('Filter by destination phone number in E.164 format'),
    from: z.string().optional().describe('Filter by sender phone number in E.164 format'),
    date_sent: z.string().optional().describe('Filter by date sent in YYYY-MM-DD format'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of messages to return per page (1-1000, default 50)'),
  },
  async ({ to, from, date_sent, page_size }) => {
    try {
      const query: Record<string, string> = {}
      if (to) query.To = to
      if (from) query.From = from
      if (date_sent) query.DateSent = date_sent
      if (page_size !== undefined) query.PageSize = String(page_size)

      const result = await twilioApi('/Messages.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_get_message ---------------------------------------------------

server.tool(
  'twilio_get_message',
  'Retrieve a single SMS message by its SID. Returns full message details including status and price.',
  {
    message_sid: z.string().describe('The Twilio message SID (e.g. "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")'),
  },
  async ({ message_sid }) => {
    try {
      const result = await twilioApi(`/Messages/${message_sid}.json`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_make_call -----------------------------------------------------

server.tool(
  'twilio_make_call',
  'Initiate a phone call via Twilio. Requires a TwiML URL or application SID to handle the call flow. Returns the created call object.',
  {
    to: z.string().describe('Destination phone number in E.164 format (e.g. "+15551234567")'),
    from: z.string().describe('Twilio phone number to call from in E.164 format'),
    url: z
      .string()
      .optional()
      .describe('TwiML URL that provides call instructions'),
    twiml: z
      .string()
      .optional()
      .describe('Inline TwiML markup for the call (alternative to url)'),
    status_callback: z
      .string()
      .optional()
      .describe('URL to receive call status webhooks'),
    timeout: z
      .number()
      .int()
      .optional()
      .describe('Number of seconds to wait for the call to be answered (default 60)'),
  },
  async ({ to, from, url, twiml, status_callback, timeout }) => {
    try {
      const formBody: Record<string, string> = { To: to, From: from }
      if (url) formBody.Url = url
      if (twiml) formBody.Twiml = twiml
      if (status_callback) formBody.StatusCallback = status_callback
      if (timeout !== undefined) formBody.Timeout = String(timeout)

      const result = await twilioApi('/Calls.json', {
        method: 'POST',
        body: formBody,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_list_calls ----------------------------------------------------

server.tool(
  'twilio_list_calls',
  'List phone calls on the Twilio account. Results are paginated and can be filtered by status or phone numbers.',
  {
    to: z.string().optional().describe('Filter by destination phone number in E.164 format'),
    from: z.string().optional().describe('Filter by caller phone number in E.164 format'),
    status: z
      .enum(['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'])
      .optional()
      .describe('Filter by call status'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of calls to return per page (1-1000, default 50)'),
  },
  async ({ to, from, status, page_size }) => {
    try {
      const query: Record<string, string> = {}
      if (to) query.To = to
      if (from) query.From = from
      if (status) query.Status = status
      if (page_size !== undefined) query.PageSize = String(page_size)

      const result = await twilioApi('/Calls.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_get_call ------------------------------------------------------

server.tool(
  'twilio_get_call',
  'Retrieve a single phone call by its SID. Returns full call details including duration and price.',
  {
    call_sid: z.string().describe('The Twilio call SID (e.g. "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")'),
  },
  async ({ call_sid }) => {
    try {
      const result = await twilioApi(`/Calls/${call_sid}.json`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_list_phone_numbers --------------------------------------------

server.tool(
  'twilio_list_phone_numbers',
  'List phone numbers owned by the Twilio account. Returns number details including capabilities and SMS/voice URLs.',
  {
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of phone numbers to return per page (1-1000, default 50)'),
    phone_number: z
      .string()
      .optional()
      .describe('Filter by phone number (partial match supported)'),
    friendly_name: z
      .string()
      .optional()
      .describe('Filter by friendly name (partial match supported)'),
  },
  async ({ page_size, phone_number, friendly_name }) => {
    try {
      const query: Record<string, string> = {}
      if (page_size !== undefined) query.PageSize = String(page_size)
      if (phone_number) query.PhoneNumber = phone_number
      if (friendly_name) query.FriendlyName = friendly_name

      const result = await twilioApi('/IncomingPhoneNumbers.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_get_account ---------------------------------------------------

server.tool(
  'twilio_get_account',
  'Get information about the Twilio account. Returns account details including status, type, and friendly name.',
  {},
  async () => {
    try {
      const result = await twilioApi('.json')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_list_recordings -----------------------------------------------

server.tool(
  'twilio_list_recordings',
  'List recordings on the Twilio account. Can be filtered by call SID or date.',
  {
    call_sid: z
      .string()
      .optional()
      .describe('Filter recordings by the call SID that generated them'),
    date_created: z
      .string()
      .optional()
      .describe('Filter by creation date in YYYY-MM-DD format'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of recordings to return per page (1-1000, default 50)'),
  },
  async ({ call_sid, date_created, page_size }) => {
    try {
      const query: Record<string, string> = {}
      if (call_sid) query.CallSid = call_sid
      if (date_created) query.DateCreated = date_created
      if (page_size !== undefined) query.PageSize = String(page_size)

      const result = await twilioApi('/Recordings.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- twilio_get_usage -----------------------------------------------------

server.tool(
  'twilio_get_usage',
  'Get usage records for the Twilio account. Returns usage data for voice, SMS, and other services within a date range.',
  {
    category: z
      .string()
      .optional()
      .describe('Usage category to filter by (e.g. "sms", "calls", "phonenumbers", "recordings")'),
    start_date: z
      .string()
      .optional()
      .describe('Start date for the usage period in YYYY-MM-DD format'),
    end_date: z
      .string()
      .optional()
      .describe('End date for the usage period in YYYY-MM-DD format'),
    include_subaccounts: z
      .boolean()
      .optional()
      .describe('Whether to include usage from subaccounts (default false)'),
  },
  async ({ category, start_date, end_date, include_subaccounts }) => {
    try {
      const query: Record<string, string> = {}
      if (category) query.Category = category
      if (start_date) query.StartDate = start_date
      if (end_date) query.EndDate = end_date
      if (include_subaccounts !== undefined) query.IncludeSubaccounts = String(include_subaccounts)

      const result = await twilioApi('/Usage/Records.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
