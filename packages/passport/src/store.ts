/**
 * PassportStore — Postgres-backed implementation.
 *
 * Extracted from Lucid-L2 offchain/src/storage/passportStore.ts
 * Key difference: file-based storage replaced with Postgres queries.
 * The interface is identical so matching-engine.ts and policy-engine.ts
 * work without any changes.
 *
 * Usage:
 *   import { initPassportStore, getPassportStore } from '@lucid/passport'
 *   initPassportStore(async (sql, params) => pool.query(sql, params))
 *   const store = getPassportStore()
 *   const passport = await store.get('passport_abc123')
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  Passport,
  PassportType,
  PassportFilters,
  PaginatedResult,
  CreatePassportInput,
} from './types'

// ---------------------------------------------------------------------------
// Database adapter — injected by the consuming app (TrustGate or Lucid-L2)
// ---------------------------------------------------------------------------

export type QueryFn = (
  sql: string,
  params?: unknown[]
) => Promise<{ rows: Record<string, unknown>[] }>

let queryFn: QueryFn | null = null

/**
 * Initialize the passport store with a Postgres query function.
 * Must be called before any store operations.
 */
export function initPassportStore(query: QueryFn): void {
  queryFn = query
}

function getQuery(): QueryFn {
  if (!queryFn) {
    throw new Error(
      'PassportStore not initialized. Call initPassportStore(query) first.'
    )
  }
  return queryFn
}

// ---------------------------------------------------------------------------
// PassportStore class
// ---------------------------------------------------------------------------

export class PassportStore {
  generateId(): string {
    return `passport_${uuidv4().replace(/-/g, '')}`
  }

  async create(input: CreatePassportInput): Promise<Passport> {
    const q = getQuery()
    const id = this.generateId()
    const now = new Date().toISOString()
    const result = await q(
      `INSERT INTO passports
        (passport_id, type, owner, metadata, name, description, version, tags, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)
       RETURNING *`,
      [
        id,
        input.type,
        input.owner,
        JSON.stringify(input.metadata),
        input.name ?? null,
        input.description ?? null,
        input.version ?? null,
        input.tags ?? [],
        now,
      ]
    )
    return this.rowToPassport(result.rows[0])
  }

  async get(passportId: string): Promise<Passport | null> {
    const q = getQuery()
    const result = await q(
      'SELECT * FROM passports WHERE passport_id = $1',
      [passportId]
    )
    return result.rows[0] ? this.rowToPassport(result.rows[0]) : null
  }

  async update(
    passportId: string,
    patch: Partial<Omit<Passport, 'passport_id' | 'created_at'>>
  ): Promise<Passport | null> {
    const q = getQuery()
    const sets: string[] = ['updated_at = now()']
    const values: unknown[] = []
    let paramIdx = 1

    for (const [key, value] of Object.entries(patch)) {
      if (key === 'passport_id' || key === 'created_at') continue
      if (key === 'metadata') {
        sets.push(`${key} = $${paramIdx}`)
        values.push(JSON.stringify(value))
      } else {
        sets.push(`${key} = $${paramIdx}`)
        values.push(value)
      }
      paramIdx++
    }

    values.push(passportId)
    const result = await q(
      `UPDATE passports SET ${sets.join(', ')} WHERE passport_id = $${paramIdx} RETURNING *`,
      values
    )
    return result.rows[0] ? this.rowToPassport(result.rows[0]) : null
  }

  async delete(passportId: string): Promise<boolean> {
    const q = getQuery()
    const result = await q(
      `UPDATE passports SET status = 'revoked', updated_at = now()
       WHERE passport_id = $1 RETURNING passport_id`,
      [passportId]
    )
    return result.rows.length > 0
  }

  async list(
    filters: PassportFilters = {}
  ): Promise<PaginatedResult<Passport>> {
    const q = getQuery()
    const conditions: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    if (filters.type) {
      const types = Array.isArray(filters.type)
        ? filters.type
        : [filters.type]
      conditions.push(`type = ANY($${paramIdx})`)
      values.push(types)
      paramIdx++
    }

    if (filters.owner) {
      conditions.push(`owner = $${paramIdx}`)
      values.push(filters.owner)
      paramIdx++
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status]
      conditions.push(`status = ANY($${paramIdx})`)
      values.push(statuses)
      paramIdx++
    }

    if (filters.tags && filters.tags.length > 0) {
      if (filters.tag_match === 'any') {
        conditions.push(`tags && $${paramIdx}`)
      } else {
        conditions.push(`tags @> $${paramIdx}`)
      }
      values.push(filters.tags)
      paramIdx++
    }

    if (filters.search) {
      conditions.push(
        `(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`
      )
      values.push(`%${filters.search}%`)
      paramIdx++
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortBy = filters.sort_by || 'created_at'
    const sortOrder = filters.sort_order || 'desc'
    const page = Math.max(1, filters.page || 1)
    const perPage = Math.min(100, Math.max(1, filters.per_page || 20))
    const offset = (page - 1) * perPage

    // Count total
    const countResult = await q(
      `SELECT COUNT(*) as total FROM passports ${where}`,
      values
    )
    const total = parseInt(String(countResult.rows[0].total), 10)

    // Fetch page
    const dataResult = await q(
      `SELECT * FROM passports ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, perPage, offset]
    )

    const totalPages = Math.ceil(total / perPage)
    return {
      items: dataResult.rows.map((r) => this.rowToPassport(r)),
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Row → Domain mapping
  // -------------------------------------------------------------------------

  private rowToPassport(row: Record<string, unknown>): Passport {
    return {
      passport_id: row.passport_id as string,
      type: row.type as Passport['type'],
      owner: row.owner as string,
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : (row.metadata as Record<string, unknown>),
      status: row.status as Passport['status'],
      name: (row.name as string) ?? undefined,
      description: (row.description as string) ?? undefined,
      version: (row.version as string) ?? undefined,
      tags: (row.tags as string[]) ?? [],
      on_chain_pda: (row.on_chain_pda as string) ?? undefined,
      on_chain_tx: (row.on_chain_tx as string) ?? undefined,
      last_sync_at: row.last_sync_at
        ? new Date(row.last_sync_at as string).getTime()
        : undefined,
      created_at: new Date(row.created_at as string).getTime(),
      updated_at: new Date(row.updated_at as string).getTime(),
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let storeInstance: PassportStore | null = null

export function getPassportStore(): PassportStore {
  if (!storeInstance) {
    storeInstance = new PassportStore()
  }
  return storeInstance
}