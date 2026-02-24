import { describe, it, expect } from 'vitest'
import { buildCloudEvent } from '../events'
import type { LlmUsageEvent, ToolCallEvent } from '../events'

describe('buildCloudEvent', () => {
  it('builds LLM usage event', () => {
    const event: LlmUsageEvent = {
      kind: 'llm',
      orgId: 'org_1',
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      providerName: 'openai',
      modelFamily: 'gpt-4o',
      statusBucket: 'success',
      service: 'trustgate',
      feature: 'chat',
      environment: 'production',
    }
    const ce = buildCloudEvent(event)
    expect(ce.type).toBe('llm.token.usage')
    expect(ce.source).toBe('lucid/trustgate')
    expect(ce.data.total_tokens).toBe(100)
  })

  it('builds tool call event', () => {
    const event: ToolCallEvent = {
      kind: 'tool',
      orgId: 'org_1',
      toolName: 'github_create_issue',
      mcpServer: 'github-mcp',
      durationMs: 250,
      statusBucket: 'success',
      service: 'mcpgate',
      feature: 'developer_tools',
      environment: 'production',
    }
    const ce = buildCloudEvent(event)
    expect(ce.type).toBe('tool.call.usage')
    expect(ce.source).toBe('lucid/mcpgate')
    expect(ce.data.tool_name).toBe('github_create_issue')
    expect(ce.data.duration_ms).toBe(250)
  })
})
