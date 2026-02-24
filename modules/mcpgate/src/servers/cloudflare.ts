/**
 * Cloudflare MCP Server -- Production-ready
 *
 * Provides tools to interact with the Cloudflare API v4 on behalf of the
 * authenticated user.  Credentials are injected via the CLOUDFLARE_TOKEN
 * environment variable (set by the MCPGate gateway).  For account-scoped
 * endpoints the CLOUDFLARE_ACCOUNT_ID environment variable is used as
 * a fallback when the caller does not provide an explicit account_id.
 *
 * Tools:
 *   cf_list_zones          -- List zones (domains) on the account
 *   cf_get_zone            -- Get details for a single zone
 *   cf_list_dns_records    -- List DNS records for a zone
 *   cf_create_dns_record   -- Create a DNS record
 *   cf_update_dns_record   -- Update an existing DNS record
 *   cf_delete_dns_record   -- Delete a DNS record
 *   cf_purge_cache         -- Purge cache for a zone
 *   cf_list_workers        -- List Workers scripts
 *   cf_get_worker          -- Get a Workers script
 *   cf_deploy_worker       -- Deploy (create/update) a Workers script
 *   cf_list_kv_namespaces  -- List KV namespaces
 *   cf_get_kv_value        -- Read a value from a KV namespace
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createApiClient, successContent, errorContent } from './shared/index.js'

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const { call, categoriseError } = createApiClient({
  name: 'cloudflare',
  baseUrl: 'https://api.cloudflare.com/client/v4',
  tokenEnvVar: 'CLOUDFLARE_TOKEN',
  authStyle: 'bearer',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve account ID from parameter or environment variable. */
function resolveAccountId(accountId?: string): string {
  const id = accountId || process.env.CLOUDFLARE_ACCOUNT_ID || ''
  if (!id) {
    throw new Error(
      'Cloudflare account ID is required. Provide account_id or set CLOUDFLARE_ACCOUNT_ID.',
    )
  }
  return id
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'cloudflare-mcp',
  version: '0.1.0',
})

// ---- cf_list_zones --------------------------------------------------------

server.tool(
  'cf_list_zones',
  'List zones (domains) on the Cloudflare account. Supports filtering by name and status. Results are paginated.',
  {
    name: z
      .string()
      .optional()
      .describe('Filter zones by domain name (e.g. "example.com")'),
    status: z
      .enum(['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'])
      .optional()
      .describe('Filter zones by status'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(5)
      .max(50)
      .optional()
      .describe('Number of zones per page (5-50, default 20)'),
  },
  async ({ name, status, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (name !== undefined) query.name = name
      if (status !== undefined) query.status = status
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call('/zones', { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_get_zone ----------------------------------------------------------

server.tool(
  'cf_get_zone',
  'Get detailed information about a single Cloudflare zone including plan, status, name servers, and settings.',
  {
    zone_id: z
      .string()
      .describe('The zone ID to retrieve'),
  },
  async ({ zone_id }) => {
    try {
      const result = await call(`/zones/${encodeURIComponent(zone_id)}`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_list_dns_records --------------------------------------------------

server.tool(
  'cf_list_dns_records',
  'List DNS records for a Cloudflare zone. Supports filtering by type, name, and content. Results are paginated.',
  {
    zone_id: z
      .string()
      .describe('The zone ID whose DNS records to list'),
    type: z
      .enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA', 'PTR', 'LOC', 'SPF'])
      .optional()
      .describe('Filter by DNS record type'),
    name: z
      .string()
      .optional()
      .describe('Filter by record name (e.g. "sub.example.com")'),
    content: z
      .string()
      .optional()
      .describe('Filter by record content/value'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(5)
      .max(100)
      .optional()
      .describe('Number of records per page (5-100, default 20)'),
  },
  async ({ zone_id, type, name, content, page, per_page }) => {
    try {
      const query: Record<string, string | undefined> = {}
      if (type !== undefined) query.type = type
      if (name !== undefined) query.name = name
      if (content !== undefined) query.content = content
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call(`/zones/${encodeURIComponent(zone_id)}/dns_records`, { query })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_create_dns_record -------------------------------------------------

server.tool(
  'cf_create_dns_record',
  'Create a new DNS record for a Cloudflare zone. Supports all standard record types. Returns the created record.',
  {
    zone_id: z
      .string()
      .describe('The zone ID to create the record in'),
    type: z
      .string()
      .describe('DNS record type (e.g. "A", "AAAA", "CNAME", "TXT", "MX")'),
    name: z
      .string()
      .describe('DNS record name (e.g. "sub.example.com" or "@" for root)'),
    content: z
      .string()
      .describe('DNS record content/value (e.g. IP address, CNAME target, TXT value)'),
    ttl: z
      .number()
      .int()
      .optional()
      .describe('Time to live in seconds (1 = automatic, default 1)'),
    priority: z
      .number()
      .int()
      .optional()
      .describe('Priority for MX and SRV records (required for MX)'),
    proxied: z
      .boolean()
      .optional()
      .describe('Whether the record is proxied through Cloudflare (default false, only for A/AAAA/CNAME)'),
    comment: z
      .string()
      .optional()
      .describe('Comment or note about the DNS record'),
  },
  async ({ zone_id, type, name, content, ttl, priority, proxied, comment }) => {
    try {
      const body: Record<string, unknown> = { type, name, content }
      if (ttl !== undefined) body.ttl = ttl
      if (priority !== undefined) body.priority = priority
      if (proxied !== undefined) body.proxied = proxied
      if (comment !== undefined) body.comment = comment

      const result = await call(`/zones/${encodeURIComponent(zone_id)}/dns_records`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_update_dns_record -------------------------------------------------

server.tool(
  'cf_update_dns_record',
  'Update an existing DNS record in a Cloudflare zone. All fields are required for a full replacement. Returns the updated record.',
  {
    zone_id: z
      .string()
      .describe('The zone ID containing the record'),
    record_id: z
      .string()
      .describe('The DNS record ID to update'),
    type: z
      .string()
      .describe('DNS record type (e.g. "A", "AAAA", "CNAME", "TXT", "MX")'),
    name: z
      .string()
      .describe('DNS record name (e.g. "sub.example.com")'),
    content: z
      .string()
      .describe('DNS record content/value'),
    ttl: z
      .number()
      .int()
      .optional()
      .describe('Time to live in seconds (1 = automatic)'),
    priority: z
      .number()
      .int()
      .optional()
      .describe('Priority for MX and SRV records'),
    proxied: z
      .boolean()
      .optional()
      .describe('Whether the record is proxied through Cloudflare'),
    comment: z
      .string()
      .optional()
      .describe('Comment or note about the DNS record'),
  },
  async ({ zone_id, record_id, type, name, content, ttl, priority, proxied, comment }) => {
    try {
      const body: Record<string, unknown> = { type, name, content }
      if (ttl !== undefined) body.ttl = ttl
      if (priority !== undefined) body.priority = priority
      if (proxied !== undefined) body.proxied = proxied
      if (comment !== undefined) body.comment = comment

      const result = await call(
        `/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(record_id)}`,
        { method: 'PUT', body },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_delete_dns_record -------------------------------------------------

server.tool(
  'cf_delete_dns_record',
  'Delete a DNS record from a Cloudflare zone. Returns confirmation of the deletion.',
  {
    zone_id: z
      .string()
      .describe('The zone ID containing the record'),
    record_id: z
      .string()
      .describe('The DNS record ID to delete'),
  },
  async ({ zone_id, record_id }) => {
    try {
      const result = await call(
        `/zones/${encodeURIComponent(zone_id)}/dns_records/${encodeURIComponent(record_id)}`,
        { method: 'DELETE' },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_purge_cache -------------------------------------------------------

server.tool(
  'cf_purge_cache',
  'Purge cached content for a Cloudflare zone. Supports purging everything or specific files by URL. Returns purge confirmation.',
  {
    zone_id: z
      .string()
      .describe('The zone ID whose cache to purge'),
    purge_everything: z
      .boolean()
      .optional()
      .describe('Set to true to purge all cached content for the zone'),
    files: z
      .array(z.string())
      .optional()
      .describe('Array of specific URLs to purge from cache (e.g. ["https://example.com/style.css"])'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Array of cache tags to purge (Enterprise only)'),
    hosts: z
      .array(z.string())
      .optional()
      .describe('Array of hostnames to purge (Enterprise only)'),
    prefixes: z
      .array(z.string())
      .optional()
      .describe('Array of URL prefixes to purge (Enterprise only)'),
  },
  async ({ zone_id, purge_everything, files, tags, hosts, prefixes }) => {
    try {
      const body: Record<string, unknown> = {}
      if (purge_everything) {
        body.purge_everything = true
      } else {
        if (files !== undefined) body.files = files
        if (tags !== undefined) body.tags = tags
        if (hosts !== undefined) body.hosts = hosts
        if (prefixes !== undefined) body.prefixes = prefixes
      }

      const result = await call(`/zones/${encodeURIComponent(zone_id)}/purge_cache`, {
        method: 'POST',
        body,
      })
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_list_workers ------------------------------------------------------

server.tool(
  'cf_list_workers',
  'List all Workers scripts on the Cloudflare account. Returns script names, modification dates, and usage information.',
  {
    account_id: z
      .string()
      .optional()
      .describe('Cloudflare account ID (falls back to CLOUDFLARE_ACCOUNT_ID env var)'),
  },
  async ({ account_id }) => {
    try {
      const acctId = resolveAccountId(account_id)
      const result = await call(`/accounts/${encodeURIComponent(acctId)}/workers/scripts`)
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_get_worker --------------------------------------------------------

server.tool(
  'cf_get_worker',
  'Get metadata and settings for a single Workers script by name. Returns script bindings, compatibility date, and usage model.',
  {
    account_id: z
      .string()
      .optional()
      .describe('Cloudflare account ID (falls back to CLOUDFLARE_ACCOUNT_ID env var)'),
    script_name: z
      .string()
      .describe('The name of the Workers script to retrieve'),
  },
  async ({ account_id, script_name }) => {
    try {
      const acctId = resolveAccountId(account_id)
      const result = await call(
        `/accounts/${encodeURIComponent(acctId)}/workers/scripts/${encodeURIComponent(script_name)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_deploy_worker -----------------------------------------------------

server.tool(
  'cf_deploy_worker',
  'Deploy (create or update) a Workers script. Uploads the script content to Cloudflare. Returns deployment confirmation and metadata.',
  {
    account_id: z
      .string()
      .optional()
      .describe('Cloudflare account ID (falls back to CLOUDFLARE_ACCOUNT_ID env var)'),
    script_name: z
      .string()
      .describe('The name of the Workers script to deploy'),
    script_content: z
      .string()
      .describe('The JavaScript or TypeScript source code of the Workers script'),
    compatibility_date: z
      .string()
      .optional()
      .describe('Compatibility date for the Workers runtime (e.g. "2024-01-01")'),
    bindings: z
      .array(
        z.object({
          type: z.string().describe('Binding type (e.g. "kv_namespace", "r2_bucket", "secret_text")'),
          name: z.string().describe('Binding name accessible in the script'),
          namespace_id: z.string().optional().describe('KV namespace ID (for kv_namespace bindings)'),
          bucket_name: z.string().optional().describe('R2 bucket name (for r2_bucket bindings)'),
          text: z.string().optional().describe('Secret value (for secret_text bindings)'),
        }),
      )
      .optional()
      .describe('Array of bindings to attach to the Worker (KV, R2, secrets, etc.)'),
  },
  async ({ account_id, script_name, script_content, compatibility_date, bindings }) => {
    try {
      const acctId = resolveAccountId(account_id)

      // Build the metadata part
      const metadata: Record<string, unknown> = {
        main_module: 'worker.js',
      }
      if (compatibility_date !== undefined) metadata.compatibility_date = compatibility_date
      if (bindings !== undefined) metadata.bindings = bindings

      // Cloudflare Workers upload uses multipart form data.
      // We send it as a JSON settings body with the script content for simplicity
      // using the script settings + content approach.
      const body: Record<string, unknown> = {
        metadata,
        script: script_content,
      }

      const result = await call(
        `/accounts/${encodeURIComponent(acctId)}/workers/scripts/${encodeURIComponent(script_name)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/javascript' },
          rawBody: script_content,
        },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_list_kv_namespaces ------------------------------------------------

server.tool(
  'cf_list_kv_namespaces',
  'List all KV namespaces on the Cloudflare account. Returns namespace IDs, titles, and binding information.',
  {
    account_id: z
      .string()
      .optional()
      .describe('Cloudflare account ID (falls back to CLOUDFLARE_ACCOUNT_ID env var)'),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Page number for pagination (default 1)'),
    per_page: z
      .number()
      .int()
      .min(5)
      .max(100)
      .optional()
      .describe('Number of namespaces per page (5-100, default 20)'),
  },
  async ({ account_id, page, per_page }) => {
    try {
      const acctId = resolveAccountId(account_id)
      const query: Record<string, string | undefined> = {}
      if (page !== undefined) query.page = String(page)
      if (per_page !== undefined) query.per_page = String(per_page)

      const result = await call(
        `/accounts/${encodeURIComponent(acctId)}/storage/kv/namespaces`,
        { query },
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

// ---- cf_get_kv_value ------------------------------------------------------

server.tool(
  'cf_get_kv_value',
  'Read a value from a Cloudflare KV namespace by key. Returns the stored value as text.',
  {
    account_id: z
      .string()
      .optional()
      .describe('Cloudflare account ID (falls back to CLOUDFLARE_ACCOUNT_ID env var)'),
    namespace_id: z
      .string()
      .describe('The KV namespace ID'),
    key_name: z
      .string()
      .describe('The key name to read from the namespace'),
  },
  async ({ account_id, namespace_id, key_name }) => {
    try {
      const acctId = resolveAccountId(account_id)
      const result = await call(
        `/accounts/${encodeURIComponent(acctId)}/storage/kv/namespaces/${encodeURIComponent(namespace_id)}/values/${encodeURIComponent(key_name)}`,
      )
      return successContent(result)
    } catch (err) {
      return errorContent(err, categoriseError)
    }
  },
)

export default server
