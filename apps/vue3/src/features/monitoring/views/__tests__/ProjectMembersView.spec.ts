import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@/App.vue'
import ProjectMembersView from '../ProjectMembersView.vue'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/services/http', () => ({ http: { get, post } }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { groupSlug: 'team', projectSlug: 'web' } }),
}))
let view: ReturnType<typeof mount> | undefined
beforeEach(() => {
  get.mockResolvedValue([])
  post.mockReset()
  vi.useFakeTimers()
})
afterEach(async () => {
  if (view) {
    for (const close of view.findAll('button[aria-label="Dismiss notification"]'))
      await close.trigger('click')
    view.unmount()
  }
  vi.useRealTimers()
  vi.clearAllMocks()
})
async function prepare(selectPermission = true) {
  view = mount(App, { global: { stubs: { RouterView: ProjectMembersView } } })
  await flushPromises()
  await view.get('#invite-email').setValue('colleague@example.com')
  if (selectPermission) await view.get('input[type="checkbox"]').setValue(true)
  return view
}

it.each([
  ['pending', 'Invitation queued'],
  ['sent', 'Invitation sent'],
])('shows %s delivery feedback in a toast', async (deliveryStatus, message) => {
  post.mockResolvedValue({ deliveryStatus })
  const page = await prepare()
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.get('[data-toast][role="status"]').text()).toContain(message)
  expect(page.get('[data-toast]').text()).toContain('colleague@example.com')
  expect((page.get('#invite-email').element as HTMLInputElement).value).toBe('')
  await vi.advanceTimersByTimeAsync(8000)
  expect(page.find('[data-toast]').exists()).toBe(false)
})

it('shows request failure in a toast and preserves the email for retry', async () => {
  post.mockRejectedValue(new Error('This email already belongs to a project member.'))
  const page = await prepare()
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.get('[data-toast][role="alert"]').text()).toContain(
    'This email already belongs to a project member.',
  )
  expect((page.get('#invite-email').element as HTMLInputElement).value).toBe(
    'colleague@example.com',
  )
})

it('does not report email delivery failure as a successful send', async () => {
  post.mockResolvedValue({ deliveryStatus: 'failed' })
  const page = await prepare()
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.get('[data-toast][role="alert"]').text()).toContain('Email delivery failed')
  expect((page.get('#invite-email').element as HTMLInputElement).value).toBe(
    'colleague@example.com',
  )
})

it('explains missing permission selection without creating an invitation', async () => {
  const page = await prepare(false)
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.get('[data-toast][role="alert"]').text()).toContain('Select at least one page')
  expect(post).not.toHaveBeenCalled()
})

it('shows toast feedback for browser email validation', async () => {
  const page = await prepare()
  await page.get('#invite-email').trigger('invalid')
  expect(page.get('[data-toast][role="alert"]').text()).toContain('Enter a valid email address')
  expect(post).not.toHaveBeenCalled()
})

it('distinguishes a successful invitation from a list refresh failure', async () => {
  const page = await prepare()
  post.mockImplementation(() => {
    get.mockRejectedValue(new Error('Reload failed'))
    return Promise.resolve({ deliveryStatus: 'pending' })
  })
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(page.get('[data-toast]').text()).toContain('Invitation created')
  expect(page.get('[data-toast]').text()).toContain('refresh')
  expect(page.get('[data-toast]').text()).not.toContain('Unable to send invitation')
})
