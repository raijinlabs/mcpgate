-- Migration 002: Passport Store
-- Creates the passports table for the @lucid/passport package.
-- Replaces Lucid-L2's file-based passports.json storage.

-- Drop old incompatible passports table (had UUID id PK, org_id, policy columns from earlier schema)
DROP TABLE IF EXISTS passports CASCADE;

CREATE TABLE IF NOT EXISTS passports (
  passport_id    TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('model','compute','tool','dataset','agent')),
  owner          TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated','revoked')),
  name           TEXT,
  description    TEXT,
  version        TEXT,
  tags           TEXT[] DEFAULT '{}',
  on_chain_pda   TEXT,
  on_chain_tx    TEXT,
  last_sync_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passports_type_status ON passports(type, status);
CREATE INDEX IF NOT EXISTS idx_passports_owner ON passports(owner);
CREATE INDEX IF NOT EXISTS idx_passports_tags ON passports USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_passports_name_search
  ON passports USING GIN(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));