/**
 * The Graph / Subgraph client for DeFi protocols.
 * Used by: Aave, Compound
 */

export interface SubgraphOpts {
  name: string
  subgraphUrl: string
  apiKeyEnvVar?: string
}

export function createSubgraphClient(opts: SubgraphOpts) {
  const { name, subgraphUrl, apiKeyEnvVar } = opts

  class SubgraphError extends Error {
    errors: unknown[]
    constructor(errors: unknown[]) {
      super(`${name} subgraph error: ${JSON.stringify(errors)}`)
      this.name = `${name}SubgraphError`
      this.errors = errors
    }
  }

  function categoriseError(err: unknown): { message: string; hint: string } {
    if (err instanceof SubgraphError) {
      return { message: err.message, hint: 'Check your subgraph query.' }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { message, hint: '' }
  }

  async function query<T = unknown>(
    gql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKeyEnvVar) {
      const key = process.env[apiKeyEnvVar]
      if (key) headers.Authorization = `Bearer ${key}`
    }

    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gql, variables }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${name} subgraph HTTP ${res.status}: ${body}`)
    }

    const json = (await res.json()) as { data?: T; errors?: unknown[] }
    if (json.errors?.length) {
      throw new SubgraphError(json.errors)
    }
    return json.data as T
  }

  return { query, SubgraphError, categoriseError }
}
