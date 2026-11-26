import type { MonitoringEnvelope, Transport } from './types.js'

export class TransportError extends Error {
  readonly status?: number

  constructor(message: string, options: { cause?: unknown; status?: number } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'TransportError'
    this.status = options.status
  }
}

// Shared across clients because browsers apply the keepalive quota per document.
let keepaliveBytes = 0
let keepaliveRequests = 0

export class HttpTransport implements Transport {
  constructor(
    private readonly endpoint: string,
    private readonly publicKey: string,
    private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async send(envelope: MonitoringEnvelope): Promise<void> {
    const body = JSON.stringify(envelope)
    const bytes = new TextEncoder().encode(body).byteLength
    const keepalive = keepaliveBytes + bytes <= 60_000 && keepaliveRequests < 15
    if (keepalive) { keepaliveBytes += bytes; keepaliveRequests++ }
    let response: Response
    try {
      response = await this.fetcher.call(globalThis, `${this.endpoint}/envelope`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'X-PMS-Key': this.publicKey,
        },
        body,
        keepalive,
      })
    } catch (cause) {
      throw new TransportError('PMS telemetry network request failed', { cause })
    } finally {
      if (keepalive) { keepaliveBytes -= bytes; keepaliveRequests-- }
    }

    if (!response.ok) {
      throw new TransportError(`PMS telemetry request failed with HTTP ${response.status}`, {
        status: response.status,
      })
    }
  }
}
