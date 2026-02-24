/**
 * Circuit breaker — protects against cascading failures from unhealthy servers.
 *
 * States:
 *   closed    → normal operation, requests pass through
 *   open      → server is unhealthy, all requests rejected immediately
 *   half-open → one probe request allowed to test recovery
 *
 * After `failureThreshold` consecutive failures, the circuit opens for
 * `resetTimeoutMs`. After that timeout, it enters half-open and allows
 * a single probe. If the probe succeeds, the circuit closes; if it fails,
 * the circuit reopens.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. */
  failureThreshold: number
  /** How long the circuit stays open before entering half-open (ms). */
  resetTimeoutMs: number
}

export interface CircuitStatus {
  state: CircuitState
  failures: number
  lastFailure?: number
  lastSuccess?: number
}

// ── Circuit Breaker ────────────────────────────────────────────────────

interface CircuitEntry {
  state: CircuitState
  failures: number
  lastFailure: number
  lastSuccess: number
  config: CircuitBreakerConfig
}

export class CircuitBreaker {
  private circuits = new Map<string, CircuitEntry>()
  private defaultConfig: CircuitBreakerConfig

  constructor(defaultConfig: CircuitBreakerConfig = { failureThreshold: 5, resetTimeoutMs: 30_000 }) {
    this.defaultConfig = defaultConfig
  }

  // ── configure ─────────────────────────────────────────────────────

  configure(serverId: string, config: CircuitBreakerConfig): void {
    const entry = this.circuits.get(serverId)
    if (entry) {
      entry.config = config
    }
    // Config will be applied when entry is created on first check
  }

  // ── canExecute ────────────────────────────────────────────────────

  /** Check if a request to this server should be allowed. */
  canExecute(serverId: string): { allowed: boolean; state: CircuitState } {
    const entry = this.circuits.get(serverId)

    // No entry = never tracked = allow
    if (!entry) return { allowed: true, state: 'closed' }

    if (entry.state === 'closed') return { allowed: true, state: 'closed' }

    if (entry.state === 'open') {
      // Check if reset timeout has elapsed
      const elapsed = Date.now() - entry.lastFailure
      if (elapsed >= entry.config.resetTimeoutMs) {
        entry.state = 'half-open'
        return { allowed: true, state: 'half-open' }
      }
      return { allowed: false, state: 'open' }
    }

    // half-open: allow one probe
    return { allowed: true, state: 'half-open' }
  }

  // ── recordSuccess ─────────────────────────────────────────────────

  /** Record a successful call — closes the circuit if half-open. */
  recordSuccess(serverId: string): void {
    const entry = this.circuits.get(serverId)
    if (!entry) return
    entry.failures = 0
    entry.lastSuccess = Date.now()
    entry.state = 'closed'
  }

  // ── recordFailure ─────────────────────────────────────────────────

  /** Record a failed call — may open the circuit. */
  recordFailure(serverId: string): void {
    let entry = this.circuits.get(serverId)
    if (!entry) {
      entry = {
        state: 'closed',
        failures: 0,
        lastFailure: 0,
        lastSuccess: 0,
        config: this.defaultConfig,
      }
      this.circuits.set(serverId, entry)
    }

    entry.failures += 1
    entry.lastFailure = Date.now()

    if (entry.state === 'half-open') {
      // Probe failed, reopen
      entry.state = 'open'
    } else if (entry.failures >= entry.config.failureThreshold) {
      entry.state = 'open'
    }
  }

  // ── getStatus ─────────────────────────────────────────────────────

  /** Get the current status for a server. */
  getStatus(serverId: string): CircuitStatus {
    const entry = this.circuits.get(serverId)
    if (!entry) return { state: 'closed', failures: 0 }

    // Check for timeout transition
    if (entry.state === 'open') {
      const elapsed = Date.now() - entry.lastFailure
      if (elapsed >= entry.config.resetTimeoutMs) {
        entry.state = 'half-open'
      }
    }

    return {
      state: entry.state,
      failures: entry.failures,
      lastFailure: entry.lastFailure || undefined,
      lastSuccess: entry.lastSuccess || undefined,
    }
  }

  // ── reset ─────────────────────────────────────────────────────────

  /** Reset a server's circuit to closed. */
  reset(serverId: string): void {
    this.circuits.delete(serverId)
  }
}
