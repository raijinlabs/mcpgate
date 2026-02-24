-- Migration 003: Receipt Events Outbox
-- TrustGate writes receipt events here (fire-and-forget).
-- Lucid-L2 consumes them for on-chain anchoring to Solana.

-- Drop old incompatible receipt_events table (had event_id, passport_id, org_id, resolved_provider from earlier schema)
DROP TABLE IF EXISTS receipt_events CASCADE;

CREATE TABLE IF NOT EXISTS receipt_events (
  id                    BIGSERIAL PRIMARY KEY,
  model_passport_id     TEXT NOT NULL,
  compute_passport_id   TEXT,
  policy_hash           TEXT NOT NULL,
  tokens_in             INTEGER,
  tokens_out            INTEGER,
  tenant_id             TEXT NOT NULL,
  model                 TEXT,
  endpoint              TEXT,
  processed             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_events_unprocessed
  ON receipt_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_receipt_events_tenant
  ON receipt_events(tenant_id, created_at DESC);