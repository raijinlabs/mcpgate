/**
 * Shopify MCP Server -- Production-ready
 *
 * Provides tools to interact with the Shopify Admin REST API on behalf of the
 * authenticated store.  Credentials are injected via the SHOPIFY_TOKEN
 * environment variable and the store name via SHOPIFY_STORE (set by the
 * MCPGate gateway).
 *
 * Tools:
 *   shopify_list_products       -- List products
 *   shopify_get_product         -- Get a single product
 *   shopify_create_product      -- Create a product
 *   shopify_update_product      -- Update a product
 *   shopify_delete_product      -- Delete a product
 *   shopify_list_orders         -- List orders
 *   shopify_get_order           -- Get a single order
 *   shopify_create_order        -- Create a draft order
 *   shopify_list_customers      -- List customers
 *   shopify_get_customer        -- Get a single customer
 *   shopify_create_customer     -- Create a customer
 *   shopify_list_collections    -- List custom collections
 *   shopify_list_inventory_items -- List inventory items
 *   shopify_count_products      -- Get product count
 *   shopify_search_products     -- Search products
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client -- dynamic base URL from SHOPIFY_STORE env
// ---------------------------------------------------------------------------

const shopifyStore = process.env.SHOPIFY_STORE || 'store'
const baseUrl = `https://${shopifyStore}.myshopify.com/admin/api/2024-01`

const { call, categoriseError } = createApiClient({
  name: 'shopify',
  baseUrl,
  tokenEnvVar: 'SHOPIFY_TOKEN',
  authStyle: 'custom-header',
  authHeader: 'X-Shopify-Access-Token',
})

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'shopify-mcp',
  version: '0.1.0',
})

// ---- shopify_list_products ------------------------------------------------

server.tool(
  'shopify_list_products',
  'List products in the Shopify store. Returns an array of product objects with titles, variants, images, and metadata. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of products to return (1-250, default 50)'),
    page_info: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
    collection_id: z
      .string()
      .optional()
      .describe('Filter by collection ID'),
    product_type: z
      .string()
      .optional()
      .describe('Filter by product type'),
    vendor: z
      .string()
      .optional()
      .describe('Filter by vendor name'),
    status: z
      .enum(['active', 'archived', 'draft'])
      .optional()
      .describe('Filter by product status'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include in the response'),
  },
  async ({ limit, page_info, collection_id, product_type, vendor, status, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (page_info !== undefined) query.page_info = page_info
      if (collection_id !== undefined) query.collection_id = collection_id
      if (product_type !== undefined) query.product_type = product_type
      if (vendor !== undefined) query.vendor = vendor
      if (status !== undefined) query.status = status
      if (fields !== undefined) query.fields = fields

      const result = await call('/products.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_get_product --------------------------------------------------

server.tool(
  'shopify_get_product',
  'Retrieve a single product by its Shopify ID. Returns the full product object including variants, images, and options.',
  {
    product_id: z.string().describe('The Shopify product ID'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include in the response'),
  },
  async ({ product_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields

      const result = await call(`/products/${product_id}.json`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_create_product -----------------------------------------------

server.tool(
  'shopify_create_product',
  'Create a new product in the Shopify store. Returns the created product object wrapped in { product: {...} }.',
  {
    title: z.string().describe('Product title'),
    body_html: z
      .string()
      .optional()
      .describe('Product description in HTML'),
    vendor: z.string().optional().describe('Product vendor name'),
    product_type: z.string().optional().describe('Product type / category'),
    tags: z
      .string()
      .optional()
      .describe('Comma-separated list of tags'),
    status: z
      .enum(['active', 'archived', 'draft'])
      .optional()
      .describe('Product status (default "draft")'),
    variants: z
      .array(
        z.object({
          title: z.string().optional().describe('Variant title'),
          price: z.string().optional().describe('Variant price as a string (e.g. "19.99")'),
          sku: z.string().optional().describe('Variant SKU'),
          inventory_quantity: z.number().int().optional().describe('Initial inventory quantity'),
          weight: z.number().optional().describe('Variant weight'),
          weight_unit: z.enum(['g', 'kg', 'oz', 'lb']).optional().describe('Weight unit'),
        }),
      )
      .optional()
      .describe('Array of product variants'),
    images: z
      .array(
        z.object({
          src: z.string().describe('Image source URL'),
          alt: z.string().optional().describe('Image alt text'),
        }),
      )
      .optional()
      .describe('Array of product images with source URLs'),
  },
  async ({ title, body_html, vendor, product_type, tags, status, variants, images }) => {
    try {
      const product: Record<string, unknown> = { title }
      if (body_html !== undefined) product.body_html = body_html
      if (vendor !== undefined) product.vendor = vendor
      if (product_type !== undefined) product.product_type = product_type
      if (tags !== undefined) product.tags = tags
      if (status !== undefined) product.status = status
      if (variants !== undefined) product.variants = variants
      if (images !== undefined) product.images = images

      const result = await call('/products.json', {
        method: 'POST',
        body: { product },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_update_product -----------------------------------------------

server.tool(
  'shopify_update_product',
  'Update an existing product in the Shopify store. Only provided fields are changed. Returns the updated product object.',
  {
    product_id: z.string().describe('The Shopify product ID to update'),
    title: z.string().optional().describe('New product title'),
    body_html: z.string().optional().describe('New product description in HTML'),
    vendor: z.string().optional().describe('New vendor name'),
    product_type: z.string().optional().describe('New product type'),
    tags: z.string().optional().describe('New comma-separated list of tags'),
    status: z
      .enum(['active', 'archived', 'draft'])
      .optional()
      .describe('New product status'),
  },
  async ({ product_id, title, body_html, vendor, product_type, tags, status }) => {
    try {
      const product: Record<string, unknown> = { id: product_id }
      if (title !== undefined) product.title = title
      if (body_html !== undefined) product.body_html = body_html
      if (vendor !== undefined) product.vendor = vendor
      if (product_type !== undefined) product.product_type = product_type
      if (tags !== undefined) product.tags = tags
      if (status !== undefined) product.status = status

      const result = await call(`/products/${product_id}.json`, {
        method: 'PUT',
        body: { product },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_delete_product -----------------------------------------------

server.tool(
  'shopify_delete_product',
  'Delete a product from the Shopify store by its ID. This action is irreversible. Returns empty on success.',
  {
    product_id: z.string().describe('The Shopify product ID to delete'),
  },
  async ({ product_id }) => {
    try {
      const result = await call(`/products/${product_id}.json`, { method: 'DELETE' })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_list_orders --------------------------------------------------

server.tool(
  'shopify_list_orders',
  'List orders from the Shopify store. Returns order objects with line items, customer info, and financial details. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of orders to return (1-250, default 50)'),
    status: z
      .enum(['open', 'closed', 'cancelled', 'any'])
      .optional()
      .describe('Filter by order status (default "any")'),
    financial_status: z
      .enum(['authorized', 'pending', 'paid', 'partially_paid', 'refunded', 'voided', 'partially_refunded', 'any', 'unpaid'])
      .optional()
      .describe('Filter by financial status'),
    fulfillment_status: z
      .enum(['shipped', 'partial', 'unshipped', 'unfulfilled', 'any'])
      .optional()
      .describe('Filter by fulfillment status'),
    created_at_min: z
      .string()
      .optional()
      .describe('Show orders created after this date (ISO 8601 format)'),
    created_at_max: z
      .string()
      .optional()
      .describe('Show orders created before this date (ISO 8601 format)'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
    page_info: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ limit, status, financial_status, fulfillment_status, created_at_min, created_at_max, fields, page_info }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (status !== undefined) query.status = status
      if (financial_status !== undefined) query.financial_status = financial_status
      if (fulfillment_status !== undefined) query.fulfillment_status = fulfillment_status
      if (created_at_min !== undefined) query.created_at_min = created_at_min
      if (created_at_max !== undefined) query.created_at_max = created_at_max
      if (fields !== undefined) query.fields = fields
      if (page_info !== undefined) query.page_info = page_info

      const result = await call('/orders.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_get_order ----------------------------------------------------

server.tool(
  'shopify_get_order',
  'Retrieve a single order by its Shopify ID. Returns the full order object with line items, customer, shipping, and payment details.',
  {
    order_id: z.string().describe('The Shopify order ID'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
  },
  async ({ order_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields

      const result = await call(`/orders/${order_id}.json`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_create_order -------------------------------------------------

server.tool(
  'shopify_create_order',
  'Create a new order in the Shopify store. Typically used for importing historical orders or creating orders programmatically. Returns the created order.',
  {
    line_items: z
      .array(
        z.object({
          variant_id: z.number().int().optional().describe('Shopify variant ID'),
          title: z.string().optional().describe('Line item title (required if no variant_id)'),
          quantity: z.number().int().min(1).describe('Quantity ordered'),
          price: z.string().optional().describe('Unit price as a string (e.g. "19.99")'),
        }),
      )
      .describe('Array of line items for the order'),
    customer: z
      .object({
        id: z.number().int().optional().describe('Existing Shopify customer ID'),
        email: z.string().optional().describe('Customer email address'),
        first_name: z.string().optional().describe('Customer first name'),
        last_name: z.string().optional().describe('Customer last name'),
      })
      .optional()
      .describe('Customer associated with the order'),
    email: z.string().optional().describe('Email for the order (overrides customer email)'),
    financial_status: z
      .enum(['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'])
      .optional()
      .describe('Financial status of the order'),
    send_receipt: z
      .boolean()
      .optional()
      .describe('Whether to send an order confirmation email (default false)'),
    note: z.string().optional().describe('Optional note for the order'),
    tags: z.string().optional().describe('Comma-separated order tags'),
  },
  async ({ line_items, customer, email, financial_status, send_receipt, note, tags }) => {
    try {
      const order: Record<string, unknown> = { line_items }
      if (customer !== undefined) order.customer = customer
      if (email !== undefined) order.email = email
      if (financial_status !== undefined) order.financial_status = financial_status
      if (send_receipt !== undefined) order.send_receipt = send_receipt
      if (note !== undefined) order.note = note
      if (tags !== undefined) order.tags = tags

      const result = await call('/orders.json', {
        method: 'POST',
        body: { order },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_list_customers -----------------------------------------------

server.tool(
  'shopify_list_customers',
  'List customers in the Shopify store. Returns customer profiles including contact info, order counts, and total spend. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of customers to return (1-250, default 50)'),
    page_info: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
    created_at_min: z
      .string()
      .optional()
      .describe('Show customers created after this date (ISO 8601 format)'),
  },
  async ({ limit, page_info, fields, created_at_min }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (page_info !== undefined) query.page_info = page_info
      if (fields !== undefined) query.fields = fields
      if (created_at_min !== undefined) query.created_at_min = created_at_min

      const result = await call('/customers.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_get_customer -------------------------------------------------

server.tool(
  'shopify_get_customer',
  'Retrieve a single customer by their Shopify ID. Returns the full customer profile with addresses, order history summary, and tags.',
  {
    customer_id: z.string().describe('The Shopify customer ID'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
  },
  async ({ customer_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (fields !== undefined) query.fields = fields

      const result = await call(`/customers/${customer_id}.json`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_create_customer ----------------------------------------------

server.tool(
  'shopify_create_customer',
  'Create a new customer in the Shopify store. Returns the created customer object.',
  {
    first_name: z.string().optional().describe('Customer first name'),
    last_name: z.string().optional().describe('Customer last name'),
    email: z.string().describe('Customer email address'),
    phone: z.string().optional().describe('Customer phone number'),
    tags: z.string().optional().describe('Comma-separated tags for the customer'),
    note: z.string().optional().describe('Internal note about the customer'),
    verified_email: z
      .boolean()
      .optional()
      .describe('Whether the email is verified (default true)'),
    send_email_invite: z
      .boolean()
      .optional()
      .describe('Whether to send an account invite email (default false)'),
    addresses: z
      .array(
        z.object({
          address1: z.string().optional().describe('Street address line 1'),
          address2: z.string().optional().describe('Street address line 2'),
          city: z.string().optional().describe('City'),
          province: z.string().optional().describe('Province / state'),
          country: z.string().optional().describe('Country'),
          zip: z.string().optional().describe('Postal / ZIP code'),
          default: z.boolean().optional().describe('Whether this is the default address'),
        }),
      )
      .optional()
      .describe('Array of customer addresses'),
  },
  async ({ first_name, last_name, email, phone, tags, note, verified_email, send_email_invite, addresses }) => {
    try {
      const customer: Record<string, unknown> = { email }
      if (first_name !== undefined) customer.first_name = first_name
      if (last_name !== undefined) customer.last_name = last_name
      if (phone !== undefined) customer.phone = phone
      if (tags !== undefined) customer.tags = tags
      if (note !== undefined) customer.note = note
      if (verified_email !== undefined) customer.verified_email = verified_email
      if (send_email_invite !== undefined) customer.send_email_invite = send_email_invite
      if (addresses !== undefined) customer.addresses = addresses

      const result = await call('/customers.json', {
        method: 'POST',
        body: { customer },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_list_collections ---------------------------------------------

server.tool(
  'shopify_list_collections',
  'List custom collections in the Shopify store. Returns collection IDs, titles, and metadata. Results are paginated.',
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of collections to return (1-250, default 50)'),
    page_info: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
    product_id: z
      .string()
      .optional()
      .describe('Filter collections that include this product ID'),
  },
  async ({ limit, page_info, fields, product_id }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (limit !== undefined) query.limit = String(limit)
      if (page_info !== undefined) query.page_info = page_info
      if (fields !== undefined) query.fields = fields
      if (product_id !== undefined) query.product_id = product_id

      const result = await call('/custom_collections.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_list_inventory_items -----------------------------------------

server.tool(
  'shopify_list_inventory_items',
  'List inventory items in the Shopify store. Returns inventory item IDs, SKUs, costs, and tracking details. Requires inventory item IDs.',
  {
    ids: z
      .string()
      .describe('Comma-separated list of inventory item IDs to retrieve (max 100)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of inventory items to return (1-250, default 50)'),
    page_info: z
      .string()
      .optional()
      .describe('Pagination cursor from the Link header of a previous response'),
  },
  async ({ ids, limit, page_info }) => {
    try {
      const query: Record<string, string | undefined> = { ids }
      if (limit !== undefined) query.limit = String(limit)
      if (page_info !== undefined) query.page_info = page_info

      const result = await call('/inventory_items.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_count_products -----------------------------------------------

server.tool(
  'shopify_count_products',
  'Get the total number of products in the Shopify store. Can be filtered by vendor, product type, collection, or status.',
  {
    vendor: z.string().optional().describe('Filter by vendor name'),
    product_type: z.string().optional().describe('Filter by product type'),
    collection_id: z.string().optional().describe('Filter by collection ID'),
    status: z
      .enum(['active', 'archived', 'draft'])
      .optional()
      .describe('Filter by product status'),
  },
  async ({ vendor, product_type, collection_id, status }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (vendor !== undefined) query.vendor = vendor
      if (product_type !== undefined) query.product_type = product_type
      if (collection_id !== undefined) query.collection_id = collection_id
      if (status !== undefined) query.status = status

      const result = await call('/products/count.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- shopify_search_products ----------------------------------------------

server.tool(
  'shopify_search_products',
  'Search for products in the Shopify store using a query string. Uses the product listing endpoint with title filter. Returns matching products.',
  {
    title: z
      .string()
      .optional()
      .describe('Filter products by title (partial match)'),
    vendor: z.string().optional().describe('Filter by vendor name'),
    product_type: z.string().optional().describe('Filter by product type'),
    status: z
      .enum(['active', 'archived', 'draft'])
      .optional()
      .describe('Filter by product status'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Number of products to return (1-250, default 50)'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated list of fields to include'),
  },
  async ({ title, vendor, product_type, status, limit, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (title !== undefined) query.title = title
      if (vendor !== undefined) query.vendor = vendor
      if (product_type !== undefined) query.product_type = product_type
      if (status !== undefined) query.status = status
      if (limit !== undefined) query.limit = String(limit)
      if (fields !== undefined) query.fields = fields

      const result = await call('/products.json', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
