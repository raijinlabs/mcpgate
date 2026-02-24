/**
 * Stripe MCP Server -- Production-ready
 *
 * Provides tools to interact with the Stripe REST API on behalf of the
 * authenticated user.  Credentials are injected via the STRIPE_TOKEN
 * environment variable (set by the MCPGate gateway).
 *
 * Stripe uses application/x-www-form-urlencoded for POST bodies rather than
 * JSON, so this server includes a form-encoding helper.
 *
 * Tools:
 *   stripe_list_customers      -- List customers with optional filters
 *   stripe_create_customer     -- Create a new customer
 *   stripe_get_customer        -- Retrieve a single customer
 *   stripe_list_payments       -- List payment intents
 *   stripe_create_payment_intent -- Create a payment intent
 *   stripe_get_payment         -- Retrieve a single payment intent
 *   stripe_list_subscriptions  -- List subscriptions
 *   stripe_create_subscription -- Create a subscription
 *   stripe_cancel_subscription -- Cancel a subscription
 *   stripe_list_invoices       -- List invoices
 *   stripe_create_invoice      -- Create an invoice
 *   stripe_get_balance         -- Get account balance
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STRIPE_TOKEN = process.env.STRIPE_TOKEN || ''
const STRIPE_API = 'https://api.stripe.com/v1'
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000

// ---------------------------------------------------------------------------
// Form encoding helper
// ---------------------------------------------------------------------------

/**
 * Flatten a nested object into `application/x-www-form-urlencoded` params
 * using Stripe's bracket notation (e.g. `items[0][price]=xxx`).
 */
function flattenToFormData(
  obj: Record<string, unknown>,
  prefix = '',
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenToFormData(
        value as Record<string, unknown>,
        fullKey,
      )
      for (const [k, v] of nested.entries()) params.append(k, v)
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          const nested = flattenToFormData(
            item as Record<string, unknown>,
            `${fullKey}[${i}]`,
          )
          for (const [k, v] of nested.entries()) params.append(k, v)
        } else {
          params.append(`${fullKey}[${i}]`, String(item))
        }
      })
    } else {
      params.append(fullKey, String(value))
    }
  }
  return params
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

interface ApiErrorDetail {
  status: number
  body: string
  retryAfterMs?: number
}

class StripeApiError extends Error {
  status: number
  retryAfterMs?: number

  constructor(detail: ApiErrorDetail) {
    const tag =
      detail.status === 401 || detail.status === 403
        ? 'Authentication/authorization error'
        : detail.status === 429
          ? 'Rate limit exceeded'
          : detail.status === 402
            ? 'Payment required'
            : detail.status >= 500
              ? 'Stripe server error'
              : 'Stripe API error'
    super(`${tag} (${detail.status}): ${detail.body}`)
    this.name = 'StripeApiError'
    this.status = detail.status
    this.retryAfterMs = detail.retryAfterMs
  }
}

function categoriseError(err: unknown): { message: string; hint: string } {
  if (err instanceof StripeApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: err.message,
        hint: 'Your Stripe token may be invalid or missing required scopes. Reconnect via /v1/auth/connect/stripe',
      }
    }
    if (err.status === 429) {
      return {
        message: err.message,
        hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
      }
    }
    if (err.status === 402) {
      return {
        message: err.message,
        hint: 'Payment required -- the card may have been declined or the account has insufficient funds.',
      }
    }
    if (err.status >= 500) {
      return {
        message: err.message,
        hint: 'Stripe is experiencing issues. Please try again shortly.',
      }
    }
    return { message: err.message, hint: 'Check your parameters and try again.' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message, hint: '' }
}

// ---------------------------------------------------------------------------
// API helper with retry on rate-limit
// ---------------------------------------------------------------------------

async function stripeApi(
  path: string,
  opts: { method?: string; body?: Record<string, unknown>; query?: Record<string, string> } = {},
  attempt = 0,
): Promise<unknown> {
  if (!STRIPE_TOKEN) {
    throw new Error(
      'Stripe token not configured. Connect via /v1/auth/connect/stripe',
    )
  }

  const method = opts.method || 'GET'

  // Build URL with optional query parameters for GET requests
  let url = `${STRIPE_API}${path}`
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString()
    if (qs) url += `?${qs}`
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_TOKEN}`,
  }

  let bodyStr: string | undefined
  if (opts.body && (method === 'POST' || method === 'PUT')) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    bodyStr = flattenToFormData(opts.body).toString()
  }

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr,
  })

  // Rate-limit awareness: retry if under budget
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
    const retryMs = retryAfterSec * 1000

    if (attempt < MAX_RETRIES && retryMs <= 10_000) {
      await new Promise((r) =>
        setTimeout(r, Math.max(RETRY_BASE_MS * (attempt + 1), retryMs)),
      )
      return stripeApi(path, opts, attempt + 1)
    }

    const body = await res.text()
    throw new StripeApiError({ status: 429, body, retryAfterMs: retryMs })
  }

  if (!res.ok) {
    const body = await res.text()
    throw new StripeApiError({ status: res.status, body })
  }

  // 204 No Content
  if (res.status === 204) return {}
  return res.json()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'stripe-mcp',
  version: '0.1.0',
})

// ---- stripe_list_customers ------------------------------------------------

server.tool(
  'stripe_list_customers',
  'List Stripe customers. Results are paginated via cursor.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of customers to return (1-100, default 10)'),
    email: z
      .string()
      .optional()
      .describe('Filter customers by exact email address'),
    starting_after: z
      .string()
      .optional()
      .describe('Cursor for pagination -- customer ID to start after'),
  },
  async ({ limit, email, starting_after }) => {
    try {
      const query: Record<string, string> = {}
      query.limit = String(limit ?? 10)
      if (email) query.email = email
      if (starting_after) query.starting_after = starting_after

      const result = await stripeApi('/customers', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_create_customer -----------------------------------------------

server.tool(
  'stripe_create_customer',
  'Create a new Stripe customer. Returns the created customer object.',
  {
    email: z.string().optional().describe('Customer email address'),
    name: z.string().optional().describe('Customer full name'),
    description: z
      .string()
      .optional()
      .describe('Free-form description of the customer'),
    metadata: z
      .record(z.string())
      .optional()
      .describe('Key-value metadata to attach to the customer'),
  },
  async ({ email, name, description, metadata }) => {
    try {
      const body: Record<string, unknown> = {}
      if (email !== undefined) body.email = email
      if (name !== undefined) body.name = name
      if (description !== undefined) body.description = description
      if (metadata !== undefined) body.metadata = metadata

      const result = await stripeApi('/customers', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_get_customer --------------------------------------------------

server.tool(
  'stripe_get_customer',
  'Retrieve a single Stripe customer by ID.',
  {
    customer_id: z.string().describe('The Stripe customer ID (e.g. cus_xxx)'),
  },
  async ({ customer_id }) => {
    try {
      const result = await stripeApi(`/customers/${customer_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_list_payments -------------------------------------------------

server.tool(
  'stripe_list_payments',
  'List Stripe payment intents. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of payment intents to return (1-100, default 10)'),
    customer: z
      .string()
      .optional()
      .describe('Filter by customer ID'),
  },
  async ({ limit, customer }) => {
    try {
      const query: Record<string, string> = {}
      query.limit = String(limit ?? 10)
      if (customer) query.customer = customer

      const result = await stripeApi('/payment_intents', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_create_payment_intent -----------------------------------------

server.tool(
  'stripe_create_payment_intent',
  'Create a Stripe payment intent. Amount is in the smallest currency unit (e.g. cents for USD). Returns the created payment intent.',
  {
    amount: z
      .number()
      .int()
      .describe('Amount in smallest currency unit (e.g. 1000 = $10.00 USD)'),
    currency: z
      .string()
      .describe('Three-letter ISO 4217 currency code (e.g. "usd")'),
    customer: z
      .string()
      .optional()
      .describe('Customer ID to associate with this payment'),
    description: z
      .string()
      .optional()
      .describe('Description of the payment'),
    metadata: z
      .record(z.string())
      .optional()
      .describe('Key-value metadata to attach to the payment intent'),
  },
  async ({ amount, currency, customer, description, metadata }) => {
    try {
      const body: Record<string, unknown> = { amount, currency }
      if (customer !== undefined) body.customer = customer
      if (description !== undefined) body.description = description
      if (metadata !== undefined) body.metadata = metadata

      const result = await stripeApi('/payment_intents', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_get_payment ---------------------------------------------------

server.tool(
  'stripe_get_payment',
  'Retrieve a single Stripe payment intent by ID.',
  {
    payment_intent_id: z
      .string()
      .describe('The Stripe payment intent ID (e.g. pi_xxx)'),
  },
  async ({ payment_intent_id }) => {
    try {
      const result = await stripeApi(`/payment_intents/${payment_intent_id}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_list_subscriptions --------------------------------------------

server.tool(
  'stripe_list_subscriptions',
  'List Stripe subscriptions. Results are paginated and can be filtered by status.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of subscriptions to return (1-100, default 10)'),
    customer: z
      .string()
      .optional()
      .describe('Filter by customer ID'),
    status: z
      .enum(['active', 'past_due', 'canceled', 'all'])
      .optional()
      .describe('Filter by subscription status'),
  },
  async ({ limit, customer, status }) => {
    try {
      const query: Record<string, string> = {}
      query.limit = String(limit ?? 10)
      if (customer) query.customer = customer
      if (status) query.status = status

      const result = await stripeApi('/subscriptions', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_create_subscription -------------------------------------------

server.tool(
  'stripe_create_subscription',
  'Create a Stripe subscription for a customer. The price parameter is a Stripe Price ID. Returns the created subscription.',
  {
    customer: z
      .string()
      .describe('Customer ID to subscribe (e.g. cus_xxx)'),
    price: z
      .string()
      .describe('Stripe Price ID (e.g. price_xxx)'),
    quantity: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Quantity for the subscription item (default 1)'),
    metadata: z
      .record(z.string())
      .optional()
      .describe('Key-value metadata to attach to the subscription'),
  },
  async ({ customer, price, quantity, metadata }) => {
    try {
      const body: Record<string, unknown> = {
        customer,
        items: [{ price, quantity: quantity ?? 1 }],
      }
      if (metadata !== undefined) body.metadata = metadata

      const result = await stripeApi('/subscriptions', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_cancel_subscription -------------------------------------------

server.tool(
  'stripe_cancel_subscription',
  'Cancel a Stripe subscription. Returns the canceled subscription object.',
  {
    subscription_id: z
      .string()
      .describe('The Stripe subscription ID (e.g. sub_xxx)'),
  },
  async ({ subscription_id }) => {
    try {
      const result = await stripeApi(`/subscriptions/${subscription_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_list_invoices -------------------------------------------------

server.tool(
  'stripe_list_invoices',
  'List Stripe invoices. Results are paginated and can be filtered by status.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of invoices to return (1-100, default 10)'),
    customer: z
      .string()
      .optional()
      .describe('Filter by customer ID'),
    status: z
      .enum(['draft', 'open', 'paid', 'void'])
      .optional()
      .describe('Filter by invoice status'),
  },
  async ({ limit, customer, status }) => {
    try {
      const query: Record<string, string> = {}
      query.limit = String(limit ?? 10)
      if (customer) query.customer = customer
      if (status) query.status = status

      const result = await stripeApi('/invoices', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_create_invoice ------------------------------------------------

server.tool(
  'stripe_create_invoice',
  'Create a Stripe invoice for a customer. Returns the created invoice.',
  {
    customer: z
      .string()
      .describe('Customer ID to invoice (e.g. cus_xxx)'),
    description: z
      .string()
      .optional()
      .describe('Description for the invoice'),
    auto_advance: z
      .boolean()
      .optional()
      .describe(
        'Whether Stripe should automatically finalise and attempt payment (default true)',
      ),
    metadata: z
      .record(z.string())
      .optional()
      .describe('Key-value metadata to attach to the invoice'),
  },
  async ({ customer, description, auto_advance, metadata }) => {
    try {
      const body: Record<string, unknown> = { customer }
      if (description !== undefined) body.description = description
      if (auto_advance !== undefined) body.auto_advance = auto_advance
      if (metadata !== undefined) body.metadata = metadata

      const result = await stripeApi('/invoices', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- stripe_get_balance ---------------------------------------------------

server.tool(
  'stripe_get_balance',
  'Get the current Stripe account balance. Returns available and pending amounts by currency.',
  {},
  async () => {
    try {
      const result = await stripeApi('/balance')
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
