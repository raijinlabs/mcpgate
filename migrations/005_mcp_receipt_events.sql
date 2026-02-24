-- migrations/005_mcp_receipt_events.sql
-- Receipt events for MCP tool calls (consumed by Lucid-L2 for on-chain anchoring)

CREATE TABLE IF NOT EXISTS mcp_receipt_events (
  id                  BIGSERIAL PRIMARY KEY,
  tool_passport_id    TEXT NOT NULL,
  tool_name           TEXT NOT NULL,
  mcp_server          TEXT NOT NULL,
  duration_ms         INTEGER,
  tenant_id           TEXT NOT NULL,
  endpoint            TEXT,
  processed           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_receipt_unprocessed
  ON mcp_receipt_events (processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_mcp_receipt_tenant
  ON mcp_receipt_events (tenant_id, created_at DESC);
