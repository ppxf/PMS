const key = 'pending-project-invitation'
const lifetime = 7 * 86400000

function valid(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/project-invitations/accept?')) return false
  const url = new URL(path, 'https://pms.invalid')
  return url.origin === 'https://pms.invalid' && url.pathname === '/project-invitations/accept' && /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('token') ?? '')
}

export function rememberInvitationRedirect(path: unknown): void {
  if (!valid(path)) return
  try { localStorage.setItem(key, JSON.stringify({ path, expiresAt: Date.now() + lifetime })) } catch { /* Navigation still carries the redirect when storage is unavailable. */ }
}

export function getInvitationRedirect(): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (value && valid(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()) return value.path
    localStorage.removeItem(key)
  } catch { /* Invalid or unavailable storage must not block sign in. */ }
  return undefined
}

export function clearInvitationRedirect(): void {
  try { localStorage.removeItem(key) } catch { /* Storage is optional. */ }
}
