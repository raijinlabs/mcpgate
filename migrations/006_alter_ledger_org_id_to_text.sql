-- migrations/006_alter_ledger_org_id_to_text.sql
-- Allow non-UUID tenant IDs in the metering ledger (MCPGate uses string IDs)

ALTER TABLE openmeter_event_ledger ALTER COLUMN org_id TYPE TEXT;
