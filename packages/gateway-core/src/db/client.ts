export type DbClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
}

export function createDbClient(databaseUrl: string): DbClient | undefined {
  if (!databaseUrl) {
    console.warn('[db] DATABASE_URL not set — DB features disabled')
    return undefined
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg') as typeof import('pg')
  const pool = new Pool({ connectionString: databaseUrl, max: 5 })
  return {
    query: (text: string, values?: unknown[]) => pool.query(text, values),
  }
}
