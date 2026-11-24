import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import ProfileFlameChart from '../ProfileFlameChart.vue'

describe('readable profile calls', () => {
  it('hides calls that round to zero without hiding a timed child', () => {
    const view = mount(ProfileFlameChart, {
      props: {
        durationMs: 10,
        segments: [
          { frameId: 0, name: 'zero', start: 1, end: 1, depth: 0 },
          { frameId: 1, name: 'tiny', start: 2, end: 2.004, depth: 0 },
          { frameId: 2, name: 'timed', start: 3, end: 3.01, depth: 1 },
        ],
      },
    })
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    expect(view.findAll('[data-frame]').map((button) => button.text())).toEqual(['timed'])
    view.unmount()
  })
  it('keeps ancestors available and returns to the previous focus', async () => {
    setLocale('en')
    const view = mount(ProfileFlameChart, { props: { segments, durationMs: 100 } })
    await view.get('[data-view="timeline"]').trigger('click')
    await view.findAll('[data-frame]')[0]!.trigger('click')
    await view.findAll('[data-frame]')[1]!.trigger('click')
    expect(view.findAll('[data-frame]').map((button) => button.text())).toContain('root')
    await view.get('[data-focus-back]').trigger('click')
    expect(view.get('[data-time-range]').text()).toContain('10.00')
    view.unmount()
  })
  const segments = [
    { frameId: 0, stackId: 0, name: 'root', start: 0, end: 10, depth: 0 },
    { frameId: 1, stackId: 1, name: 'render', resource: '/app.ts', start: 2, end: 8, depth: 1 },
    { name: 'Unsampled', start: 10, end: 100, depth: 0 },
  ]
  it('shows sampling coverage, expands calls and selects full function details', async () => {
    setLocale('en')
    const view = mount(ProfileFlameChart, { props: { segments, durationMs: 100 } })
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('10.0%')
    expect(view.findAll('[data-call-row]')).toHaveLength(2)
    await view.get('[data-toggle-call]').trigger('click')
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    await view.get('[aria-label="Find frames"]').setValue('render')
    expect(view.text()).toContain('render')
    await view.get('[data-select-call="1"]').trigger('click')
    expect(view.get('aside').text()).toContain('/app.ts')
    expect(view.get('aside').text()).toContain('6.00')
    await view.get('[data-view="timeline"]').trigger('click')
    await view.get('[data-focus-sampled]').trigger('click')
    expect(view.get('[data-time-range]').text()).toContain('10.00')
    view.unmount()
  })
  it('handles entirely unsampled recordings without inventing function calls', () => {
    const view = mount(ProfileFlameChart, {
      props: { segments: [segments[2]!], durationMs: 100 },
    })
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('0.0%')
    expect(view.findAll('[data-call-row]')).toHaveLength(0)
    expect(view.text()).toContain('No sampled function calls')
    view.unmount()
  })
  it('keeps repeated calls separate and only collapses the selected parent interval', async () => {
    const view = mount(ProfileFlameChart, {
      props: {
        segments: [
          ...segments.slice(0, 2),
          { frameId: 0, stackId: 0, name: 'root', start: 20, end: 30, depth: 0 },
          { frameId: 1, stackId: 1, name: 'render', start: 22, end: 28, depth: 1 },
        ],
        durationMs: 100,
      },
    })
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('20.0%')
    expect(view.findAll('[data-call-row]')).toHaveLength(4)
    await view.findAll('[data-toggle-call]')[0]!.trigger('click')
    expect(view.findAll('[data-select-call="1"]')).toHaveLength(1)
    await view.get('[aria-label="Find frames"]').setValue('RENDER')
    expect(view.findAll('[data-call-row]')).toHaveLength(4)
    await view.get('[aria-label="Find frames"]').setValue('missing')
    expect(view.findAll('[data-call-row]')).toHaveLength(0)
    view.unmount()
  })
  it('bounds initial rows and clears stale selection when the recording changes', async () => {
    const view = mount(ProfileFlameChart, {
      props: {
        segments: Array.from({ length: 250 }, (_, index) => ({
          frameId: index,
          name: `call-${index}`,
          start: index,
          end: index + 1,
          depth: 0,
        })),
        durationMs: 250,
      },
    })
    expect(view.findAll('[data-call-row]')).toHaveLength(200)
    await view.get('[data-select-call="0"]').trigger('click')
    expect(view.get('aside').text()).toContain('call-0')
    await view.setProps({ segments: [], durationMs: 0 })
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('0.0%')
    expect(view.text()).not.toContain('call-0')
    view.unmount()
  })
})
