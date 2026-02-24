import { randomUUID } from 'crypto'
import type { DbClient } from './events'
import { buildCloudEvent } from './events'
import type { CloudEvent } from './client'
import { OpenMeterClient } from './client'

type LedgerRow = {
  id: number
  event_id: string
  org_id: string
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
  provider_name: string
  model_family: string
  status_bucket: 'success' | 'error' | 'timeout'
  service: string
  feature: string
  environment: string
  created_at: string
}

/**
 * Outbox worker: 3-transaction pattern for billing-grade reliability.
 *
 * TX1: Lock + Lease eligible rows (prevents duplicate work across Railway instances)
 * SEND: Batch send to OpenMeter (no DB locks held)
 * TX2/TX3: Mark sent or failed
 *
 * Runs on a 3-second loop. 100 events per batch.
 */
export class OutboxWorker {
  private db: DbClient
  private client: OpenMeterClient
  private workerId: string
  private batchSize: number
  private intervalMs: number
  private leaseSeconds: number
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(opts: {
    db: DbClient
    client?: OpenMeterClient
    workerId?: string
    batchSize?: number
    intervalMs?: number
    leaseSeconds?: number
  }) {
    this.db = opts.db
    this.client = opts.client ?? new OpenMeterClient()
    this.workerId = opts.workerId ?? `outbox-${randomUUID().slice(0, 8)}`
    this.batchSize = opts.batchSize ?? 100
    this.intervalMs = opts.intervalMs ?? 3000
    this.leaseSeconds = opts.leaseSeconds ?? 30
  }

  start(): void {
    if (this.timer) return
    console.log(`[outbox] Starting worker ${this.workerId} (interval=${this.intervalMs}ms, batch=${this.batchSize})`)
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log(`[outbox] Stopped worker ${this.workerId}`)
  }

  async tick(): Promise<void> {
    if (this.running) return // skip if previous tick still running
    this.running = true

    try {
      // TX1: Lease eligible rows
      const leased = await this.leaseRows()
      if (leased.length === 0) {
        this.running = false
        return
      }

      // Build CloudEvents batch (no trace_id/run_id — DB only fields)
      const cloudEvents: CloudEvent[] = leased.map((row) =>
        buildCloudEvent({
          kind: 'llm',
          orgId: row.org_id,
          totalTokens: row.total_tokens,
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
          providerName: row.provider_name,
          modelFamily: row.model_family,
          statusBucket: row.status_bucket,
          service: row.service,
          feature: row.feature,
          environment: row.environment,
        })
      )

      // SEND: No DB locks held during network call
      try {
        await this.client.sendBatch(cloudEvents)
        // TX2: Mark sent
        await this.markSent(leased.map((r) => r.id))
        console.log(`[outbox] Sent ${leased.length} events`)
      } catch (err) {
        // TX3: Mark failed (increment attempts, store error)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        await this.markFailed(leased.map((r) => r.id), errorMsg)
        console.error(`[outbox] Batch failed: ${errorMsg}`)
      }
    } catch (err) {
      console.error(`[outbox] Tick error:`, err instanceof Error ? err.message : err)
    } finally {
      this.running = false
    }
  }

  private async leaseRows(): Promise<LedgerRow[]> {
    const result = await this.db.query(
      `UPDATE openmeter_event_ledger
       SET lease_until = now() + interval '${this.leaseSeconds} seconds',
           lease_owner = $1
       WHERE id IN (
         SELECT id FROM openmeter_event_ledger
         WHERE sent_at IS NULL
           AND attempts < 10
           AND (lease_until IS NULL OR lease_until < now())
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, event_id, org_id, total_tokens, prompt_tokens, completion_tokens,
                 provider_name, model_family, status_bucket, service, feature, environment, created_at`,
      [this.workerId, this.batchSize]
    )
    return result.rows as LedgerRow[]
  }

  private async markSent(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    await this.db.query(
      `UPDATE openmeter_event_ledger
       SET sent_at = now(), lease_until = NULL, lease_owner = NULL
       WHERE id = ANY($1)`,
      [ids]
    )
  }

  private async markFailed(ids: number[], error: string): Promise<void> {
    if (ids.length === 0) return
    await this.db.query(
      `UPDATE openmeter_event_ledger
       SET attempts = attempts + 1,
           last_error = $2,
           lease_until = NULL,
           lease_owner = NULL
       WHERE id = ANY($1)`,
      [ids, error]
    )
  }
}