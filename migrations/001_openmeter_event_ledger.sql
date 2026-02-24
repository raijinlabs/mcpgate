-- Migration: 001_openmeter_event_ledger
-- Description: OpenMeter billing event ledger with outbox pattern + lease fields
-- Date: 2026-02-13

CREATE TABLE IF NOT EXISTS openmeter_event_ledger (
  id BIGSERIAL PRIMARY KEY,

  event_id UUID NOT NULL UNIQUE,

  org_id UUID NOT NULL,
  total_tokens INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,

  provider_name TEXT NOT NULL,
  model_family TEXT NOT NULL,
  status_bucket TEXT NOT NULL CHECK (status_bucket IN ('success', 'error', 'timeout')),
  service TEXT NOT NULL,
  feature TEXT NOT NULL,
  environment TEXT NOT NULL,

  -- Internal correlation (DB ONLY — never sent to OpenMeter)
  trace_id TEXT,
  run_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts <= 10),

  -- Lease fields (prevents duplicate work across processes)
  lease_until TIMESTAMPTZ,
  lease_owner TEXT
);

-- Outbox scan: only eligible rows (lease_until check done at query time since now() is not IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_outbox_scan ON openmeter_event_ledger (created_at)
WHERE sent_at IS NULL
  AND attempts < 10;

CREATE INDEX IF NOT EXISTS idx_org_reporting ON openmeter_event_ledger (org_id, created_at DESC);