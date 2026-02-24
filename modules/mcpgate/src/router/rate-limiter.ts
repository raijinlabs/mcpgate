/**
 * Token bucket rate limiter — per-server request throttling.
 *
 * Each server gets its own bucket with a configurable refill rate and
 * burst size.  Tokens are refilled continuously (not in discrete intervals)
 * using a timestamp-based approach.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Tokens added per second. */
  rate: number
  /** Maximum burst size (bucket capacity). */
  burst: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Milliseconds until a token is available (0 if allowed). */
  retryAfterMs: number
  /** Tokens remaining after this request. */
  remaining: number
}

// ── Token Bucket ───────────────────────────────────────────────────────

interface Bucket {
  tokens: number
  lastRefill: number
  config: RateLimitConfig
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private defaultConfig: RateLimitConfig

  constructor(defaultConfig: RateLimitConfig = { rate: 10, burst: 20 }) {
    this.defaultConfig = defaultConfig
  }

  // ── configure ─────────────────────────────────────────────────────

  /** Set a custom rate limit for a specific server. */
  configure(serverId: string, config: RateLimitConfig): void {
    const bucket = this.buckets.get(serverId)
    if (bucket) {
      bucket.config = config
    } else {
      this.buckets.set(serverId, {
        tokens: config.burst,
        lastRefill: Date.now(),
        config,
      })
    }
  }

  // ── consume ───────────────────────────────────────────────────────

  /** Try to consume one token for a server. Returns whether the request is allowed. */
  consume(serverId: string): RateLimitResult {
    let bucket = this.buckets.get(serverId)
    if (!bucket) {
      bucket = {
        tokens: this.defaultConfig.burst,
        lastRefill: Date.now(),
        config: this.defaultConfig,
      }
      this.buckets.set(serverId, bucket)
    }

    // Refill tokens based on elapsed time
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000  // seconds
    const refill = elapsed * bucket.config.rate
    bucket.tokens = Math.min(bucket.config.burst, bucket.tokens + refill)
    bucket.lastRefill = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.floor(bucket.tokens),
      }
    }

    // Not enough tokens — calculate retry delay
    const deficit = 1 - bucket.tokens
    const retryAfterMs = Math.ceil((deficit / bucket.config.rate) * 1000)

    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    }
  }

  // ── reset ─────────────────────────────────────────────────────────

  /** Reset a server's bucket (e.g. after circuit breaker opens). */
  reset(serverId: string): void {
    this.buckets.delete(serverId)
  }
}
