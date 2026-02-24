/**
 * Shared response helpers for MCP servers.
 *
 * Every MCP tool handler returns either a success or error payload.  These
 * two helpers standardise the shape so each server doesn't need its own copy.
 */

export function successContent(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

export function errorContent(
  err: unknown,
  categorise?: (e: unknown) => { message: string; hint: string },
) {
  const { message, hint } = categorise?.(err) ?? {
    message: err instanceof Error ? err.message : String(err),
    hint: '',
  }
  const payload: Record<string, string> = { error: message }
  if (hint) payload.hint = hint
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  }
}
