/**
 * API Client Factory -- Eliminates boilerplate across all MCP servers.
 *
 * Usage:
 *   const { call, ErrorClass, categoriseError } = createApiClient({
 *     name: 'github', baseUrl: 'https://api.github.com',
 *     tokenEnvVar: 'GITHUB_TOKEN', authStyle: 'bearer',
 *   })
 */

type AuthStyle =
  | 'bearer'
  | 'bot'
  | 'basic'
  | 'api-key-header'
  | 'api-key-query'
  | 'custom-header'
  | 'none'

export interface ApiClientOpts {
  name: string
  baseUrl: string
  tokenEnvVar: string
  authStyle: AuthStyle
  authHeader?: string
  authPrefix?: string
  defaultHeaders?: Record<string, string>
  contentType?: 'json' | 'form-urlencoded'
  maxRetries?: number
  retryBaseMs?: number
}

interface CallOpts {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  query?: Record<string, string | undefined>
  rawBody?: string
}

export function createApiClient(opts: ApiClientOpts) {
  const {
    name,
    baseUrl,
    tokenEnvVar,
    authStyle,
    authHeader,
    authPrefix,
    defaultHeaders = {},
    contentType = 'json',
    maxRetries = 2,
    retryBaseMs = 1000,
  } = opts

  class ApiError extends Error {
    status: number
    retryAfterMs?: number

    constructor(detail: { status: number; body: string; retryAfterMs?: number }) {
      const tag =
        detail.status === 401 || detail.status === 403
          ? 'Authentication/authorization error'
          : detail.status === 429
            ? 'Rate limit exceeded'
            : detail.status >= 500
              ? `${name} server error`
              : `${name} API error`
      super(`${tag} (${detail.status}): ${detail.body}`)
      this.name = `${name.charAt(0).toUpperCase() + name.slice(1)}ApiError`
      this.status = detail.status
      this.retryAfterMs = detail.retryAfterMs
    }
  }

  function categoriseError(err: unknown): { message: string; hint: string } {
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) {
        return {
          message: err.message,
          hint: `Your ${name} token may be invalid or missing required scopes. Reconnect via /v1/auth/connect/${name}`,
        }
      }
      if (err.status === 429) {
        return {
          message: err.message,
          hint: `Rate limit hit. Retry after ${err.retryAfterMs ?? 60_000}ms or reduce request frequency.`,
        }
      }
      if (err.status >= 500) {
        return {
          message: err.message,
          hint: `${name} is experiencing issues. Please try again shortly.`,
        }
      }
      return { message: err.message, hint: 'Check your parameters and try again.' }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { message, hint: '' }
  }

  function buildAuthHeaders(): Record<string, string> {
    const token = process.env[tokenEnvVar] || ''
    switch (authStyle) {
      case 'bearer':
        return token ? { Authorization: `Bearer ${token}` } : {}
      case 'bot':
        return token ? { Authorization: `Bot ${token}` } : {}
      case 'basic':
        return token ? { Authorization: `Basic ${token}` } : {}
      case 'api-key-header':
        return token ? { [authHeader || 'x-api-key']: token } : {}
      case 'custom-header':
        return token ? { [authHeader || 'x-api-key']: authPrefix ? `${authPrefix} ${token}` : token } : {}
      case 'api-key-query':
      case 'none':
        return {}
    }
  }

  async function call(
    path: string,
    callOpts: CallOpts = {},
    attempt = 0,
  ): Promise<unknown> {
    const token = process.env[tokenEnvVar] || ''
    if (authStyle !== 'none' && authStyle !== 'api-key-query' && !token) {
      throw new Error(
        `${name} token not configured. Set ${tokenEnvVar} or connect via /v1/auth/connect/${name}`,
      )
    }

    // Build URL with query params
    let url = `${baseUrl}${path}`
    const qp = new URLSearchParams()
    if (callOpts.query) {
      for (const [k, v] of Object.entries(callOpts.query)) {
        if (v !== undefined) qp.set(k, v)
      }
    }
    if (authStyle === 'api-key-query' && token) {
      qp.set(authHeader || 'api_key', token)
    }
    const qs = qp.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs

    // Build headers
    const headers: Record<string, string> = {
      ...buildAuthHeaders(),
      ...defaultHeaders,
      ...callOpts.headers,
    }
    const method = callOpts.method || 'GET'
    let bodyStr: string | undefined
    if (callOpts.rawBody !== undefined) {
      bodyStr = callOpts.rawBody
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = contentType === 'form-urlencoded'
          ? 'application/x-www-form-urlencoded'
          : 'application/json'
      }
    } else if (callOpts.body !== undefined) {
      if (contentType === 'form-urlencoded') {
        bodyStr = new URLSearchParams(
          Object.entries(callOpts.body as Record<string, string>).filter(([, v]) => v !== undefined),
        ).toString()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else {
        bodyStr = JSON.stringify(callOpts.body)
        headers['Content-Type'] = 'application/json'
      }
    }

    const res = await fetch(url, { method, headers, body: bodyStr })

    // Rate-limit retry
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('Retry-After') || '60')
      const retryMs = retryAfterSec * 1000
      if (attempt < maxRetries && retryMs <= 10_000) {
        await new Promise((r) => setTimeout(r, Math.max(retryBaseMs * (attempt + 1), retryMs)))
        return call(path, callOpts, attempt + 1)
      }
      const body = await res.text()
      throw new ApiError({ status: 429, body, retryAfterMs: retryMs })
    }

    if (!res.ok) {
      const body = await res.text()
      throw new ApiError({ status: res.status, body })
    }

    if (res.status === 204) return {}
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return res.json()
    return res.text()
  }

  return { call, ApiError, categoriseError }
}
