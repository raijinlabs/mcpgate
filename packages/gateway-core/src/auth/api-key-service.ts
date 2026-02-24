import { createHash } from 'node:crypto'
import type { ApiKeyRecord } from '../types'

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
let dbQuery: QueryFn | null = null

export function initApiKeyDb(query: QueryFn): void {
  dbQuery = query
}

const keys = new Map<string, ApiKeyRecord>()

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function registerApiKey(record: Omit<ApiKeyRecord, 'keyHash'> & { rawKey: string }): ApiKeyRecord {
  const saved: ApiKeyRecord = {
    id: record.id,
    tenantId: record.tenantId,
    keyHash: hashApiKey(record.rawKey),
    createdAt: record.createdAt,
    disabled: record.disabled,
    scopes: record.scopes ?? null,
  }
  keys.set(saved.id, saved)
  if (dbQuery) {
    dbQuery(
      'INSERT INTO gateway_api_keys (id, tenant_id, key_hash, disabled, created_at, scopes) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
      [saved.id, saved.tenantId, saved.keyHash, saved.disabled ?? false, saved.createdAt, saved.scopes ? JSON.stringify(saved.scopes) : null]
    ).catch(err => console.error('[api-key] DB write failed:', err))
  }
  return saved
}

export function verifyApiKey(rawKey: string): ApiKeyRecord | null {
  const targetHash = hashApiKey(rawKey)
  for (const record of keys.values()) {
    if (!record.disabled && record.keyHash === targetHash) return record
  }
  return null
}

export async function verifyApiKeyAsync(rawKey: string): Promise<ApiKeyRecord | null> {
  const targetHash = hashApiKey(rawKey)
  if (dbQuery) {
    try {
      const result = await dbQuery(
        'SELECT id, tenant_id, key_hash, disabled, created_at, scopes FROM gateway_api_keys WHERE key_hash = $1 AND disabled = false',
        [targetHash]
      )
      if (result.rows[0]) {
        return {
          id: result.rows[0].id as string,
          tenantId: result.rows[0].tenant_id as string,
          keyHash: result.rows[0].key_hash as string,
          createdAt: result.rows[0].created_at as string,
          disabled: result.rows[0].disabled as boolean,
          scopes: result.rows[0].scopes as string[] | null,
        }
      }
    } catch {
      // DB unreachable — fall through to in-memory
    }
  }
  // Fallback to in-memory (covers no-DB, DB-miss, and DB-error cases)
  return verifyApiKey(rawKey)
}

/** Test-only: clear all keys */
export function _resetKeys(): void { keys.clear() }
