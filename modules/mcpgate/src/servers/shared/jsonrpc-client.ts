/**
 * JSON-RPC 2.0 client over HTTP.
 * Used by: Alchemy, Chainlink, MetaMask/Infura
 */

let rpcIdCounter = 1

export interface JsonRpcOpts {
  name: string
  urlEnvVar: string
  defaultUrl?: string
}

export function createJsonRpcClient(opts: JsonRpcOpts) {
  const { name, urlEnvVar, defaultUrl } = opts

  class JsonRpcError extends Error {
    code: number
    constructor(code: number, message: string) {
      super(`${name} RPC error (${code}): ${message}`)
      this.name = `${name}RpcError`
      this.code = code
    }
  }

  function categoriseError(err: unknown): { message: string; hint: string } {
    if (err instanceof JsonRpcError) {
      return { message: err.message, hint: 'Check your RPC method and parameters.' }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { message, hint: '' }
  }

  async function call<T = unknown>(
    method: string,
    params: unknown[] | Record<string, unknown> = [],
  ): Promise<T> {
    const url = process.env[urlEnvVar] || defaultUrl
    if (!url) throw new Error(`${name} RPC URL not configured. Set ${urlEnvVar}`)

    const id = rpcIdCounter++
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`${name} HTTP ${res.status}: ${body}`)
    }

    const json = (await res.json()) as { result?: T; error?: { code: number; message: string } }
    if (json.error) {
      throw new JsonRpcError(json.error.code, json.error.message)
    }
    return json.result as T
  }

  return { call, JsonRpcError, categoriseError }
}
