/**
 * Chain Executor — atomic multi-tool workflows with variable interpolation.
 *
 * Executes a DAG of tool calls where steps can reference results from
 * previous steps via `{{step_id.path.to.field}}` syntax.  Steps with
 * no dependencies run in parallel.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ChainStep {
  id: string
  tool: string
  server: string
  args: Record<string, unknown>
  depends_on?: string[]
}

export type ErrorStrategy = 'stop' | 'continue'

export interface ChainRequest {
  session_id?: string
  steps: ChainStep[]
  on_error?: ErrorStrategy
}

export interface StepResult {
  id: string
  status: 'success' | 'error' | 'skipped'
  result?: unknown
  error?: string
  duration_ms: number
}

export interface ChainResult {
  chain_id: string
  status: 'completed' | 'partial' | 'failed'
  steps: StepResult[]
  total_duration_ms: number
}

// ── Variable interpolation ─────────────────────────────────────────────

/** Resolve `{{step_id.path.to.field}}` references in a value. */
function interpolate(value: unknown, results: Map<string, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
      const parts = path.trim().split('.')
      const stepId = parts[0]
      const stepResult = results.get(stepId)
      if (stepResult == null) return _match

      let current: unknown = stepResult
      for (let i = 1; i < parts.length; i++) {
        if (current == null || typeof current !== 'object') return _match
        current = (current as Record<string, unknown>)[parts[i]]
      }
      return current != null ? String(current) : _match
    })
  }

  if (Array.isArray(value)) {
    return value.map(v => interpolate(v, results))
  }

  if (value != null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolate(v, results)
    }
    return out
  }

  return value
}

// ── Topological sort ───────────────────────────────────────────────────

/** Return steps in topological order (groups of parallel-executable steps). */
function topoSort(steps: ChainStep[]): ChainStep[][] {
  const stepMap = new Map(steps.map(s => [s.id, s]))
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const step of steps) {
    inDegree.set(step.id, step.depends_on?.length ?? 0)
    for (const dep of step.depends_on ?? []) {
      const list = dependents.get(dep) ?? []
      list.push(step.id)
      dependents.set(dep, list)
    }
  }

  const layers: ChainStep[][] = []
  const remaining = new Set(steps.map(s => s.id))

  while (remaining.size > 0) {
    const layer: ChainStep[] = []
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        layer.push(stepMap.get(id)!)
      }
    }
    if (layer.length === 0) {
      throw new Error('Circular dependency detected in chain')
    }
    layers.push(layer)
    for (const step of layer) {
      remaining.delete(step.id)
      for (const depId of dependents.get(step.id) ?? []) {
        inDegree.set(depId, (inDegree.get(depId) ?? 1) - 1)
      }
    }
  }

  return layers
}

// ── Executor ───────────────────────────────────────────────────────────

export type ToolCallFn = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ content: unknown[]; isError: boolean }>

export async function executeChain(
  request: ChainRequest,
  callTool: ToolCallFn,
): Promise<ChainResult> {
  const chainId = `chain_${Date.now().toString(36)}`
  const start = Date.now()
  const stepResults: StepResult[] = []
  const resultData = new Map<string, unknown>()
  const onError = request.on_error ?? 'stop'
  let hasFailed = false

  const layers = topoSort(request.steps)

  for (const layer of layers) {
    const layerPromises = layer.map(async (step): Promise<StepResult> => {
      if (hasFailed && onError === 'stop') {
        return { id: step.id, status: 'skipped', duration_ms: 0 }
      }

      const resolvedArgs = interpolate(step.args, resultData) as Record<string, unknown>
      const stepStart = Date.now()

      try {
        const result = await callTool(step.server, step.tool, resolvedArgs)
        const content = result.content?.[0] as { text?: string } | undefined
        let parsed: unknown = content?.text
        try { parsed = JSON.parse(content?.text ?? '') } catch { /* keep as string */ }
        resultData.set(step.id, parsed)

        return {
          id: step.id,
          status: result.isError ? 'error' : 'success',
          result: parsed,
          error: result.isError ? content?.text : undefined,
          duration_ms: Date.now() - stepStart,
        }
      } catch (err) {
        hasFailed = true
        return {
          id: step.id,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
          duration_ms: Date.now() - stepStart,
        }
      }
    })

    const results = await Promise.all(layerPromises)
    stepResults.push(...results)
  }

  const hasError = stepResults.some(s => s.status === 'error')
  const allFailed = stepResults.every(s => s.status === 'error' || s.status === 'skipped')

  return {
    chain_id: chainId,
    status: allFailed ? 'failed' : hasError ? 'partial' : 'completed',
    steps: stepResults,
    total_duration_ms: Date.now() - start,
  }
}
