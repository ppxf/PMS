import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Toaster, toast } from '..'

let viewport: ReturnType<typeof mount>
beforeEach(() => {
  vi.useFakeTimers()
  viewport = mount(Toaster)
})
afterEach(async () => {
  for (const button of viewport.findAll('button[aria-label="Dismiss notification"]'))
    await button.trigger('click')
  viewport.unmount()
  vi.useRealTimers()
})
describe('global toast notifications', () => {
  it('announces errors and supports manual dismissal', async () => {
    toast.error('Invitation failed', 'Please try again.')
    await nextTick()
    expect(viewport.get('[role="alert"]').text()).toContain('Please try again.')
    await viewport.get('button[aria-label="Dismiss notification"]').trigger('click')
    expect(viewport.find('[data-toast]').exists()).toBe(false)
  })
  it('limits visible notifications and automatically removes them', async () => {
    toast.success('First message')
    toast.warning('Second message')
    toast.error('Third message')
    toast.success('Fourth message')
    await nextTick()
    expect(viewport.findAll('[data-toast]')).toHaveLength(3)
    expect(viewport.text()).not.toContain('First message')
    expect(viewport.text()).toContain('Fourth message')
    await vi.advanceTimersByTimeAsync(8000)
    expect(viewport.find('[data-toast]').exists()).toBe(false)
  })
})
