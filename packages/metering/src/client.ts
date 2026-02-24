export type CloudEvent = {
  specversion: '1.0'
  id: string
  source: string
  type: string
  subject: string
  time: string
  datacontenttype: string
  data: Record<string, unknown>
}

export class OpenMeterClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || process.env.OPENMETER_API_URL || 'https://openmeter.cloud'
    this.apiKey = apiKey || process.env.OPENMETER_API_KEY || ''
  }

  async sendEvent(event: CloudEvent, timeoutMs = 5000): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cloudevents+json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`OpenMeter HTTP ${res.status}`)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return // expected inline timeout
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  async sendBatch(events: CloudEvent[], timeoutMs = 5000): Promise<void> {
    if (events.length === 0) return

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cloudevents-batch+json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(events),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`OpenMeter HTTP ${res.status}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

export const openMeterClient = new OpenMeterClient()