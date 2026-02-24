-- migrations/004_generalize_ledger.sql
-- Generalize openmeter_event_ledger for multi-gateway events (LLM + MCP tools)

ALTER TABLE openmeter_event_ledger
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'llm.token.usage',
  ADD COLUMN IF NOT EXISTS quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS dimension_type TEXT DEFAULT 'tokens';

-- Make LLM-specific columns nullable for non-LLM events
ALTER TABLE openmeter_event_ledger
  ALTER COLUMN total_tokens DROP NOT NULL,
  ALTER COLUMN prompt_tokens DROP NOT NULL,
  ALTER COLUMN completion_tokens DROP NOT NULL,
  ALTER COLUMN provider_name DROP NOT NULL,
  ALTER COLUMN model_family DROP NOT NULL;

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_ledger_event_type ON openmeter_event_ledger (event_type);
