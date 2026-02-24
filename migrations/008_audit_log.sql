-- migrations/008_audit_log.sql
-- Audit log for MCPGate tool calls

CREATE TABLE IF NOT EXISTS mcpgate_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  api_key_id      TEXT NOT NULL,
  server_id       TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  args_hash       TEXT,
  status          TEXT NOT NULL CHECK (status IN ('success', 'error', 'denied')),
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
  ON mcpgate_audit_log (tenant_id, created_at DESC);
