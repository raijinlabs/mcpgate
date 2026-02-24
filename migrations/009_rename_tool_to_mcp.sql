-- Migration 009: Rename passport type 'tool' → 'mcp'
-- Required for MCPGate v2 identity system

UPDATE passports SET type = 'mcp' WHERE type = 'tool';
