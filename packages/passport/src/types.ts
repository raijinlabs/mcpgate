/**
 * Passport types — extracted from Lucid-L2 passportStore.ts
 * These are the core domain types for the passport system.
 */

export type PassportType = 'model' | 'compute' | 'mcp' | 'dataset' | 'agent' | 'plugin'
export type PassportStatus = 'active' | 'deprecated' | 'revoked'

export interface Passport {
  passport_id: string
  type: PassportType
  owner: string
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  status: PassportStatus
  tags?: string[]
  name?: string
  description?: string
  version?: string
  on_chain_pda?: string
  on_chain_tx?: string
  last_sync_at?: number
}

export interface PassportFilters {
  type?: PassportType | PassportType[]
  owner?: string
  status?: PassportStatus | PassportStatus[]
  tags?: string[]
  tag_match?: 'all' | 'any'
  search?: string
  page?: number
  per_page?: number
  sort_by?: 'created_at' | 'updated_at' | 'name'
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

export interface CreatePassportInput {
  type: PassportType
  owner: string
  metadata: Record<string, unknown>
  name?: string
  description?: string
  version?: string
  tags?: string[]
}

/** Policy type — flexible JSON object validated by AJV schema */
export type Policy = Record<string, unknown>

/** Model metadata — flexible JSON validated by AJV schema */
export type ModelMeta = Record<string, unknown>

/** Compute metadata — flexible JSON validated by AJV schema */
export type ComputeMeta = Record<string, unknown>