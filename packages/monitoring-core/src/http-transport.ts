import type { MonitoringEnvelope, Transport } from './types.js'

export class TransportError extends Error {
  readonly status?: number

  constructor(message: string, options: { cause?: unknown; status?: number } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'TransportError'
    this.status = options.status
  }
}

export class HttpTransport implements Transport {
  constructor(
    private readonly endpoint: string,
    private readonly publicKey: string,
    private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async send(envelope: MonitoringEnvelope): Promise<void> {
    let response: Response
    try {
      response = await this.fetcher.call(globalThis, `${this.endpoint}/envelope`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Key': this.publicKey,
        },
        body: JSON.stringify(envelope),
      })
    } catch (cause) {
      throw new TransportError('PMS telemetry network request failed', { cause })
    }

    if (!response.ok) {
      throw new TransportError(`PMS telemetry request failed with HTTP ${response.status}`, {
        status: response.status,
      })
    }
  }
}
