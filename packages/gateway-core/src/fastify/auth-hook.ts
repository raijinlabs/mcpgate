import type { FastifyRequest } from 'fastify'
import type { ApiKeyRecord } from '../types'
import { verifyApiKey, verifyApiKeyAsync } from '../auth/api-key-service'

export function resolveTenantId(request: FastifyRequest): string {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing API key')
  const raw = auth.replace('Bearer ', '').trim()
  const record = verifyApiKey(raw)
  if (!record) throw new Error('Invalid API key')
  return record.tenantId
}

export async function resolveTenantIdAsync(request: FastifyRequest): Promise<string> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing API key')
  const raw = auth.replace('Bearer ', '').trim()
  const record = await verifyApiKeyAsync(raw)
  if (!record) throw new Error('Invalid API key')
  return record.tenantId
}

export async function resolveApiKeyAsync(request: FastifyRequest): Promise<ApiKeyRecord> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing API key')
  const raw = auth.replace('Bearer ', '').trim()
  const record = await verifyApiKeyAsync(raw)
  if (!record) throw new Error('Invalid API key')
  return record
}
