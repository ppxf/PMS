import type { SpanHandle, SpanOptions } from './tracing-types.js'

export interface MonitoringIntegrationClient {
  startInactiveSpan(options: SpanOptions): SpanHandle
  getClientState(): { endpoint: string } | undefined
  flush(): Promise<void>
  getPropagationTargets(): readonly string[]
}

export interface MonitoringRouter {
  beforeEach(callback: (to: { matched: { path: string }[]; path: string }) => void): unknown
  afterEach(callback: (_to: unknown, _from: unknown, failure?: unknown) => void): unknown
}

/** Shared protocol only: SDK packages never import each other. */
export interface MonitoringIntegration {
  readonly name: string
  setup(context: {
    client: MonitoringIntegrationClient
    window?: Window
    router?: MonitoringRouter
  }): void
}
