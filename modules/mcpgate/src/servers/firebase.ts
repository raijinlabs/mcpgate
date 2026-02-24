/**
 * Firebase (Firestore) MCP Server -- Production-ready
 *
 * Provides tools to interact with the Firestore REST API on behalf of the
 * authenticated user.  Credentials are injected via the FIREBASE_TOKEN and
 * FIREBASE_PROJECT_ID environment variables (set by the MCPGate gateway).
 *
 * Tools:
 *   firebase_get_document         -- Get a single document
 *   firebase_create_document      -- Create a new document
 *   firebase_update_document      -- Update a document
 *   firebase_delete_document      -- Delete a document
 *   firebase_list_documents       -- List documents in a collection
 *   firebase_query                -- Run a structured query
 *   firebase_batch_get            -- Get multiple documents at once
 *   firebase_list_collections     -- List collection IDs under a document
 *   firebase_begin_transaction    -- Begin a new transaction
 *   firebase_commit_transaction   -- Commit a transaction
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { successContent, errorContent, createApiClient } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

function getProjectId(): string {
  const projectId = process.env.FIREBASE_PROJECT_ID || ''
  if (!projectId) {
    throw new Error(
      'FIREBASE_PROJECT_ID not configured. Set it to your Firebase project ID.',
    )
  }
  return projectId
}

function getBaseUrl(): string {
  const projectId = getProjectId()
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
}

function makeClient() {
  return createApiClient({
    name: 'firebase',
    baseUrl: getBaseUrl(),
    tokenEnvVar: 'FIREBASE_TOKEN',
    authStyle: 'bearer',
  })
}

async function firestoreApi(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const { call } = makeClient()
  return call(path, opts)
}

function getCategoriseError() {
  return makeClient().categoriseError
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'firebase-mcp',
  version: '0.1.0',
})

// ---- firebase_get_document ------------------------------------------------

server.tool(
  'firebase_get_document',
  'Get a single Firestore document by collection and document ID. Returns the document fields and metadata.',
  {
    collection: z.string().describe('Collection path (e.g. "users" or "users/uid123/orders")'),
    document_id: z.string().describe('Document ID within the collection'),
    mask_field_paths: z
      .array(z.string())
      .optional()
      .describe('Array of field paths to return (field mask). If empty, returns all fields.'),
  },
  async ({ collection, document_id, mask_field_paths }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (mask_field_paths !== undefined && mask_field_paths.length > 0) {
        // Firestore REST API expects repeated mask.fieldPaths params
        // We'll handle this by adding them to the query
        query['mask.fieldPaths'] = mask_field_paths.join(',')
      }

      const result = await firestoreApi(`/${collection}/${document_id}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_create_document ---------------------------------------------

server.tool(
  'firebase_create_document',
  'Create a new Firestore document in a collection. Returns the created document with its auto-generated or specified ID.',
  {
    collection: z.string().describe('Collection path (e.g. "users" or "users/uid123/orders")'),
    document_id: z
      .string()
      .optional()
      .describe('Optional document ID. If not specified, Firestore auto-generates one.'),
    fields: z
      .record(z.unknown())
      .describe('Document fields as a Firestore value map (e.g. { "name": { "stringValue": "John" }, "age": { "integerValue": "30" } })'),
  },
  async ({ collection, document_id, fields }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (document_id !== undefined) query.documentId = document_id

      const result = await firestoreApi(`/${collection}`, {
        method: 'POST',
        body: { fields },
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_update_document ---------------------------------------------

server.tool(
  'firebase_update_document',
  'Update (patch) a Firestore document. Only specified fields are modified. Uses PATCH with updateMask.',
  {
    collection: z.string().describe('Collection path (e.g. "users")'),
    document_id: z.string().describe('Document ID to update'),
    fields: z
      .record(z.unknown())
      .describe('Document fields to update as a Firestore value map'),
    update_mask: z
      .array(z.string())
      .optional()
      .describe('Array of field paths to update. If not specified, all provided fields are updated.'),
  },
  async ({ collection, document_id, fields, update_mask }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (update_mask !== undefined && update_mask.length > 0) {
        query['updateMask.fieldPaths'] = update_mask.join(',')
      }

      const result = await firestoreApi(`/${collection}/${document_id}`, {
        method: 'PATCH',
        body: { fields },
        query,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_delete_document ---------------------------------------------

server.tool(
  'firebase_delete_document',
  'Delete a Firestore document by collection and document ID. Returns empty on success.',
  {
    collection: z.string().describe('Collection path (e.g. "users")'),
    document_id: z.string().describe('Document ID to delete'),
  },
  async ({ collection, document_id }) => {
    try {
      const result = await firestoreApi(`/${collection}/${document_id}`, {
        method: 'DELETE',
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_list_documents ----------------------------------------------

server.tool(
  'firebase_list_documents',
  'List documents in a Firestore collection. Results are paginated.',
  {
    collection: z.string().describe('Collection path (e.g. "users" or "users/uid123/orders")'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe('Maximum number of documents to return (1-300, default 20)'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
    order_by: z
      .string()
      .optional()
      .describe('Field path to order by (e.g. "created_at desc")'),
    show_missing: z
      .boolean()
      .optional()
      .describe('If true, include missing documents in the results'),
  },
  async ({ collection, page_size, page_token, order_by, show_missing }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (page_size !== undefined) query.pageSize = String(page_size)
      if (page_token !== undefined) query.pageToken = page_token
      if (order_by !== undefined) query.orderBy = order_by
      if (show_missing !== undefined) query.showMissing = String(show_missing)

      const result = await firestoreApi(`/${collection}`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_query -------------------------------------------------------

server.tool(
  'firebase_query',
  'Run a structured query against Firestore. Supports filtering, ordering, and projections using the Firestore query format.',
  {
    collection_id: z.string().describe('Collection ID to query (e.g. "users")'),
    parent: z
      .string()
      .optional()
      .describe('Parent document path for subcollection queries (e.g. "users/uid123"). Leave empty for root collections.'),
    where: z
      .unknown()
      .optional()
      .describe('Firestore structured query filter object (compositeFilter or fieldFilter)'),
    order_by: z
      .array(z.object({
        field: z.object({ fieldPath: z.string().describe('Field path to order by') }).describe('Field reference'),
        direction: z.enum(['ASCENDING', 'DESCENDING']).optional().describe('Sort direction'),
      }))
      .optional()
      .describe('Array of order-by clauses'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of results to return'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of results to skip'),
    select_fields: z
      .array(z.string())
      .optional()
      .describe('Array of field paths to include in the response (field projection)'),
  },
  async ({ collection_id, parent, where, order_by, limit, offset, select_fields }) => {
    try {
      const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId: collection_id }],
      }
      if (where !== undefined) structuredQuery.where = where
      if (order_by !== undefined) structuredQuery.orderBy = order_by
      if (limit !== undefined) structuredQuery.limit = limit
      if (offset !== undefined) structuredQuery.offset = offset
      if (select_fields !== undefined && select_fields.length > 0) {
        structuredQuery.select = {
          fields: select_fields.map((f) => ({ fieldPath: f })),
        }
      }

      const parentPath = parent ? `/${parent}` : ''
      const result = await firestoreApi(`${parentPath}:runQuery`, {
        method: 'POST',
        body: { structuredQuery },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_batch_get ---------------------------------------------------

server.tool(
  'firebase_batch_get',
  'Get multiple Firestore documents in a single request. More efficient than individual gets for bulk retrieval.',
  {
    document_paths: z
      .array(z.string())
      .describe('Array of full document paths (e.g. ["users/uid1", "users/uid2"])'),
    mask_field_paths: z
      .array(z.string())
      .optional()
      .describe('Array of field paths to return (field mask)'),
  },
  async ({ document_paths, mask_field_paths }) => {
    try {
      const projectId = getProjectId()
      const base = `projects/${projectId}/databases/(default)/documents`
      const documents = document_paths.map((p) => `${base}/${p}`)

      const body: Record<string, unknown> = { documents }
      if (mask_field_paths !== undefined && mask_field_paths.length > 0) {
        body.mask = { fieldPaths: mask_field_paths }
      }

      const result = await firestoreApi('/:batchGet', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_list_collections --------------------------------------------

server.tool(
  'firebase_list_collections',
  'List collection IDs under a document or at the root level. Returns an array of collection IDs.',
  {
    document_path: z
      .string()
      .optional()
      .describe('Document path to list sub-collections for (e.g. "users/uid123"). Leave empty for root collections.'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe('Maximum number of collection IDs to return'),
    page_token: z
      .string()
      .optional()
      .describe('Page token from a previous response for pagination'),
  },
  async ({ document_path, page_size, page_token }) => {
    try {
      const path = document_path ? `/${document_path}` : ''
      const body: Record<string, unknown> = {}
      if (page_size !== undefined) body.pageSize = page_size
      if (page_token !== undefined) body.pageToken = page_token

      const result = await firestoreApi(`${path}:listCollectionIds`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_begin_transaction -------------------------------------------

server.tool(
  'firebase_begin_transaction',
  'Begin a new Firestore transaction. Returns a transaction ID to use with subsequent operations and commit.',
  {
    read_only: z
      .boolean()
      .optional()
      .describe('If true, begin a read-only transaction (default false)'),
    read_time: z
      .string()
      .optional()
      .describe('ISO 8601 timestamp for read-only transaction consistency (only for read-only transactions)'),
  },
  async ({ read_only, read_time }) => {
    try {
      const body: Record<string, unknown> = {}
      if (read_only) {
        const options: Record<string, unknown> = {}
        if (read_time !== undefined) options.readTime = read_time
        body.options = { readOnly: options }
      }

      const result = await firestoreApi('/:beginTransaction', {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

// ---- firebase_commit_transaction ------------------------------------------

server.tool(
  'firebase_commit_transaction',
  'Commit a Firestore transaction with a set of writes. All writes are applied atomically.',
  {
    transaction: z.string().describe('Transaction ID from firebase_begin_transaction'),
    writes: z
      .array(z.unknown())
      .describe('Array of Firestore write objects. Each can be an update, delete, or transform operation.'),
  },
  async ({ transaction, writes }) => {
    try {
      const result = await firestoreApi('/:commit', {
        method: 'POST',
        body: { transaction, writes },
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, getCategoriseError())
    }
  },
)

export default server
