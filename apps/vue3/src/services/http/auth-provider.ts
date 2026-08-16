export interface HttpAuthProvider {
  getAccessToken: () => string | null
  onUnauthorized: () => void | Promise<void>
}

let authProvider: HttpAuthProvider | null = null

export function configureHttpAuthProvider(provider: HttpAuthProvider): void {
  authProvider = provider
}

export function getHttpAuthProvider(): HttpAuthProvider | null {
  return authProvider
}
