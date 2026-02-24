import type { UsageRecord } from '../types'

const usage: UsageRecord[] = []

export function recordUsage(entry: UsageRecord) {
  usage.push(entry)
}

export function listUsageForTenant(tenantId: string) {
  return usage.filter((u) => u.tenantId === tenantId)
}

/** Test-only: clear all usage */
export function _resetUsage(): void { usage.length = 0 }
