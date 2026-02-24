/**
 * GraphQL client for MCP servers that talk to GraphQL APIs.
 * Used by: Linear, Monday.com, Railway, Aave, Compound
 */

export interface GraphQLClientOpts {
  name: string
  endpoint: string
  tokenEnvVar: string
  authStyle?: 'bearer' | 'api-key-header'
  authHeader?: string
}

export function createGraphQLClient(opts: GraphQLClientOpts) {
  const { name, endpoint, tokenEnvVar, authStyle = 'bearer', authHeader } = opts

  class GraphQLError extends Error {
    errors: unknown[]
    constructor(errors: unknown[]) {
      super(`${name} GraphQL error: ${JSON.stringify(errors)}`)
      this.name = `${name}GraphQLError`
      this.errors = errors
    }
  }

  function categoriseError(err: unknown): { message: string; hint: string } {
    if (err instanceof GraphQLError) {
      return { message: err.message, hint: 'Check your GraphQL query and variables.' }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { message, hint: '' }
  }

  async function query<T = unknown>(
    gql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const token = process.env[tokenEnvVar] || ''
    if (!token && authStyle !== 'api-key-header') {
      throw new Error(`${name} token not configured. Set ${tokenEnvVar}`)
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authStyle === 'bearer') {
      headers.Authorization = `Bearer ${token}`
    } else if (authStyle === 'api-key-header') {
      if (token) headers[authHeader || 'x-api-key'] = token
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gql, variables }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${name} HTTP ${res.status}: ${body}`)
    }

    const json = (await res.json()) as { data?: T; errors?: unknown[] }
    if (json.errors?.length) {
      throw new GraphQLError(json.errors)
    }
    return json.data as T
  }

  return { query, GraphQLError, categoriseError }
}
