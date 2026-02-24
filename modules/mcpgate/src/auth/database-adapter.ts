/**
 * DatabaseAdapter — Postgres-backed credential storage with AES-256-GCM encryption.
 *
 * Stores and retrieves encrypted tokens from the `credential_store` table.
 * No OAuth methods are implemented — this adapter only handles storage and
 * retrieval.  OAuth flows are handled by other adapters (e.g. Nango).
 *
 * The encryption key must be 32 bytes (64 hex characters) and is read from the
 * `CREDENTIAL_ENCRYPTION_KEY` environment variable at construction time.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type {
  CredentialAdapter,
  TokenResult,
  ConnectionInfo,
} from './credential-adapter.js'

// ── Types ──────────────────────────────────────────────────────────────

export type QueryFn = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>

// ── Encryption helpers ─────────────────────────────────────────────────

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]) // iv(12) + tag(16) + ciphertext
}

function decrypt(data: Buffer, key: Buffer): string {
  const iv = data.subarray(0, IV_LEN)
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = data.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc) + decipher.final('utf8')
}

// ── Adapter ────────────────────────────────────────────────────────────

export class DatabaseAdapter implements CredentialAdapter {
  readonly name = 'database'

  private readonly queryFn: QueryFn
  private readonly encryptionKey: Buffer

  constructor(queryFn: QueryFn, encryptionKey: string) {
    this.queryFn = queryFn
    this.encryptionKey = Buffer.from(encryptionKey, 'hex')

    if (this.encryptionKey.length !== 32) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters).',
      )
    }
  }

  // ── getToken ──────────────────────────────────────────────────────────

  async getToken(tenantId: string, provider: string): Promise<TokenResult | null> {
    const { rows } = await this.queryFn(
      `SELECT encrypted_token, token_type, expires_at, metadata
         FROM credential_store
        WHERE tenant_id = $1 AND provider = $2`,
      [tenantId, provider],
    )

    if (rows.length === 0) return null

    const row = rows[0]
    const encryptedToken = row.encrypted_token as Buffer
    const token = decrypt(Buffer.from(encryptedToken), this.encryptionKey)
    const expiresAt = row.expires_at
      ? new Date(row.expires_at as string).getTime()
      : undefined
    const metadata = (row.metadata ?? {}) as Record<string, unknown>

    return {
      token,
      type: row.token_type as TokenResult['type'],
      expiresAt,
      refreshToken: metadata.refreshToken as string | undefined,
      headers: metadata.headers as Record<string, string> | undefined,
    }
  }

  // ── storeToken ────────────────────────────────────────────────────────

  async storeToken(
    tenantId: string,
    provider: string,
    result: TokenResult,
  ): Promise<void> {
    const encryptedToken = encrypt(result.token, this.encryptionKey)

    const metadata: Record<string, unknown> = {}
    if (result.refreshToken) metadata.refreshToken = result.refreshToken
    if (result.headers) metadata.headers = result.headers

    const expiresAt = result.expiresAt
      ? new Date(result.expiresAt).toISOString()
      : null

    await this.queryFn(
      `INSERT INTO credential_store
              (tenant_id, provider, encrypted_token, token_type, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET
              encrypted_token = EXCLUDED.encrypted_token,
              token_type      = EXCLUDED.token_type,
              expires_at      = EXCLUDED.expires_at,
              metadata        = EXCLUDED.metadata,
              updated_at      = now()`,
      [
        tenantId,
        provider,
        encryptedToken,
        result.type,
        expiresAt,
        JSON.stringify(metadata),
      ],
    )
  }

  // ── revokeToken ───────────────────────────────────────────────────────

  async revokeToken(tenantId: string, provider: string): Promise<void> {
    await this.queryFn(
      `DELETE FROM credential_store WHERE tenant_id = $1 AND provider = $2`,
      [tenantId, provider],
    )
  }

  // ── listConnections ───────────────────────────────────────────────────

  async listConnections(tenantId: string): Promise<ConnectionInfo[]> {
    const { rows } = await this.queryFn(
      `SELECT provider, expires_at, created_at
         FROM credential_store
        WHERE tenant_id = $1
        ORDER BY provider`,
      [tenantId],
    )

    const now = Date.now()

    return rows.map((row): ConnectionInfo => {
      const expiresAt = row.expires_at
        ? new Date(row.expires_at as string).getTime()
        : undefined
      const connectedAt = row.created_at
        ? new Date(row.created_at as string).getTime()
        : undefined

      let status: ConnectionInfo['status'] = 'connected'
      if (expiresAt && expiresAt < now) {
        status = 'expired'
      }

      return {
        provider: row.provider as string,
        status,
        connectedAt,
        expiresAt,
      }
    })
  }
}
