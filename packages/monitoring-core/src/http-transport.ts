import type { MonitoringEnvelope, Transport } from './types.js'

export class HttpTransport implements Transport {
  constructor(
    private readonly endpoint: string,
    private readonly publicKey: string,
    private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async send(envelope: MonitoringEnvelope): Promise<void> {
    try {
      const response = await this.fetcher(`${this.endpoint}/envelope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Key': this.publicKey,
        },
        body: JSON.stringify(envelope),
      })
      if (!response.ok) return
    } catch {
      // Telemetry cannot interrupt the host application.
    }
  }
}
