import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberInvitationRedirect, getInvitationRedirect, clearInvitationRedirect } from '../invitation-redirect'
const path = `/project-invitations/accept?token=${'a'.repeat(43)}`
describe('invitation continuation', () => {
  beforeEach(() => { localStorage.clear(); vi.useRealTimers() })
  it('restores the invitation after registration and verification in another tab', () => {
    rememberInvitationRedirect(path)
    expect(getInvitationRedirect()).toBe(path)
    clearInvitationRedirect()
    expect(getInvitationRedirect()).toBeUndefined()
  })
  it('rejects external destinations and expires saved invitations', () => {
    rememberInvitationRedirect('//evil.example/')
    expect(getInvitationRedirect()).toBeUndefined()
    rememberInvitationRedirect(path)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86400000)
    expect(getInvitationRedirect()).toBeUndefined()
    vi.restoreAllMocks()
  })
})
