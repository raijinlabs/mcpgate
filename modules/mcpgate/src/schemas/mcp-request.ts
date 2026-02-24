import { z } from 'zod'

export const toolCallRequestSchema = z.object({
  server_id: z.string(),
  tool_name: z.string(),
  arguments: z.record(z.unknown()).default({}),
})

export const serverRegisterSchema = z.object({
  name: z.string(),
  transport: z.enum(['streamable-http', 'sse', 'stdio']),
  url: z.string().url().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  description: z.string().optional(),
  auth_provider: z.string().optional(),
})

export const serverListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(1).max(100).default(20),
})

export type ToolCallRequest = z.infer<typeof toolCallRequestSchema>
export type ServerRegisterRequest = z.infer<typeof serverRegisterSchema>
