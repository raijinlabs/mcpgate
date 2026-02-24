import { canonicalize } from 'json-canonicalize'

/**
 * Canonicalize JSON using RFC 8785 (JCS).
 *
 * Determinism requirements:
 * - stable key ordering
 * - no whitespace differences
 * - consistent number/string encoding
 *
 * Extracted from Lucid-L2 offchain/src/utils/canonicalJson.ts
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value as Record<string, unknown>)
}