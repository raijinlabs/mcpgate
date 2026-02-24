import type { FastifyInstance } from 'fastify'

export function registerHealthRoute(app: FastifyInstance, serviceName: string) {
  app.get('/health', async () => ({ ok: true, service: serviceName }))
}
