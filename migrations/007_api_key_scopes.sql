-- migrations/007_api_key_scopes.sql
-- Add RBAC scopes to API keys. NULL = allow-all (backwards compatible).

ALTER TABLE gateway_api_keys
  ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT NULL;

COMMENT ON COLUMN gateway_api_keys.scopes IS
  'JSON array of allowed tool patterns. NULL = allow all. Format: ["server:tool", "server:*"]';
