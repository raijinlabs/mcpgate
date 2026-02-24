/**
 * Server health tracking + periodic health probes.
 *
 * The existing markHealthy/markUnhealthy/isHealthy functions provide simple
 * health tracking.  The HealthProbe class adds periodic monitoring that
 * integrates with the CircuitBreaker to automatically open/close circuits.
 */

import type { CircuitBreaker } from './circuit-breaker.js'

// ── Simple health tracking (existing) ──────────────────────────────────

const healthStatus = new Map<string, { healthy: boolean; lastCheck: number; error?: string }>()

export function markHealthy(serverId: string): void {
  healthStatus.set(serverId, { healthy: true, lastCheck: Date.now() })
}

export function markUnhealthy(serverId: string, error: string): void {
  healthStatus.set(serverId, { healthy: false, lastCheck: Date.now(), error })
}

export function isHealthy(serverId: string): boolean {
  const status = healthStatus.get(serverId)
  if (!status) return true
  if (Date.now() - status.lastCheck > 5 * 60 * 1000) return true
  return status.healthy
}

export function getHealthStatus(): Map<string, { healthy: boolean; lastCheck: number; error?: string }> {
  return new Map(healthStatus)
}

// ── Health Probe ───────────────────────────────────────────────────────

export type ProbeFn = (serverId: string) => Promise<boolean>

export interface HealthProbeConfig {
  /** Probe interval in milliseconds (default: 60000 = 1 minute). */
  intervalMs?: number
  /** Function that tests whether a server is responsive. */
  probeFn: ProbeFn
  /** Optional circuit breaker to notify on state changes. */
  circuitBreaker?: CircuitBreaker
}

export class HealthProbe {
  private servers = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly intervalMs: number
  private readonly probeFn: ProbeFn
  private readonly circuitBreaker?: CircuitBreaker

  constructor(config: HealthProbeConfig) {
    this.intervalMs = config.intervalMs ?? 60_000
    this.probeFn = config.probeFn
    this.circuitBreaker = config.circuitBreaker
  }

  /** Register a server for periodic health checks. */
  register(serverId: string): void {
    this.servers.add(serverId)
  }

  /** Unregister a server from health checks. */
  unregister(serverId: string): void {
    this.servers.delete(serverId)
  }

  /** Start the periodic probe loop. */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.probeAll().catch(() => {})
    }, this.intervalMs)
  }

  /** Stop the probe loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Probe all registered servers once. */
  async probeAll(): Promise<void> {
    const promises = Array.from(this.servers).map(async (serverId) => {
      try {
        const ok = await this.probeFn(serverId)
        if (ok) {
          markHealthy(serverId)
          this.circuitBreaker?.recordSuccess(serverId)
        } else {
          markUnhealthy(serverId, 'Probe returned unhealthy')
          this.circuitBreaker?.recordFailure(serverId)
        }
      } catch (err) {
        markUnhealthy(serverId, err instanceof Error ? err.message : 'Probe failed')
        this.circuitBreaker?.recordFailure(serverId)
      }
    })
    await Promise.allSettled(promises)
  }

  /** Number of registered servers. */
  get size(): number {
    return this.servers.size
  }
}
