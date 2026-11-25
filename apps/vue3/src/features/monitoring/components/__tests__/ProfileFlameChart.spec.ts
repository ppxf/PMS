import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import ProfileFlameChart from '../ProfileFlameChart.vue'

describe('readable profile calls', () => {
  it('hides calls that round to zero without hiding a timed child', async () => {
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
    await view.get('[data-view="tree"]').trigger('click')
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    expect(view.findAll('[data-frame]').map((button) => button.text())).toEqual(['timed'])
    view.unmount()
  })
  it('fits sampled calls immediately and keeps the range when selecting functions', async () => {
    setLocale('en')
    const view = mount(ProfileFlameChart, { props: { segments, durationMs: 100 } })
    expect(view.get('[data-view="timeline"]').attributes('aria-pressed')).toBe('true')
    await view.get('[data-view="timeline"]').trigger('click')
    const range = view.get('[data-time-range]').text()
    expect(range).toContain('10.00')
    expect(range).not.toContain('100.00')
    await view.findAll('[data-frame]')[0]!.trigger('click')
    await view.findAll('[data-frame]')[1]!.trigger('click')
    expect(view.findAll('[data-frame]').map((button) => button.text())).toContain('root')
    expect(view.get('[data-time-range]').text()).toBe(range)
    expect(view.get('aside').text()).toContain('render')
    expect(view.find('[data-focus-back]').exists()).toBe(false)
    expect(view.find('[aria-label="Reset flame chart"]').exists()).toBe(false)
    expect(view.find('[data-focus-sampled]').exists()).toBe(false)
    view.unmount()
  })
  const segments = [
    { frameId: 0, stackId: 0, name: 'root', start: 0, end: 10, depth: 0 },
    { frameId: 1, stackId: 1, name: 'render', resource: '/app.ts', start: 2, end: 8, depth: 1 },
    { name: 'Unsampled', start: 10, end: 100, depth: 0 },
  ]
  it('shows sampling coverage, searches flat functions and selects full details', async () => {
    setLocale('en')
    const view = mount(ProfileFlameChart, { props: { segments, durationMs: 100 } })
    await view.get('[data-view="tree"]').trigger('click')
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('10.0%')
    expect(view.findAll('[data-call-row]')).toHaveLength(2)
    await view.get('[aria-label="Find frames"]').setValue('render')
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    expect(view.text()).toContain('render')
    await view.get('[data-select-call="1"]').trigger('click')
    expect(view.get('aside').text()).toContain('/app.ts')
    expect(view.get('aside').text()).toContain('6.00')
    await view.get('[data-view="timeline"]').trigger('click')
    expect(view.get('[data-time-range]').text()).toContain('10.00')
    view.unmount()
  })
  it('removes nameless flame levels and opens with the full named sample interval', async () => {
    const view = mount(ProfileFlameChart, {
      props: {
        durationMs: 1000,
        segments: [
          { frameId: 0, name: '', start: 0, end: 20, depth: 0 },
          { frameId: 1, name: 'run', start: 0.2, end: 15.8, depth: 1 },
          { frameId: 2, name: '  ', start: 0.2, end: 15.8, depth: 2 },
          { frameId: 3, name: 'work', start: 0.2, end: 15.8, depth: 3 },
          { name: 'Unsampled', start: 20, end: 1000, depth: 0 },
        ],
      },
    })
    await view.get('[data-view="timeline"]').trigger('click')
    expect(view.get('[data-time-range]').text()).toContain('0.00')
    expect(view.get('[data-time-range]').text()).toContain('15.60')
    expect(view.get('canvas').attributes('style')).toContain('80px')
    await view.setProps({ segments: [{ name: 'Unsampled', start: 0, end: 1000, depth: 0 }] })
    expect(view.find('canvas').exists()).toBe(false)
    expect(view.text()).toContain('No sampled function calls')
    view.unmount()
  })
  it('removes idle gaps between distant samples instead of shrinking the first stack', () => {
    const view = mount(ProfileFlameChart, {
      props: {
        durationMs: 1100,
        segments: [
          { frameId: 0, name: 'run', start: 0.2, end: 15.8, depth: 0 },
          { frameId: 1, name: 'work', start: 0.2, end: 15.8, depth: 1 },
          { name: 'Unsampled', start: 15.8, end: 1008.4, depth: 0 },
          { frameId: 0, name: 'run', start: 1008.4, end: 1024, depth: 0 },
          { frameId: 1, name: 'work', start: 1008.4, end: 1024, depth: 1 },
        ],
      },
    })
    expect(view.get('[data-time-range]').text()).toContain('31.20')
    expect(view.get('[data-time-range]').text()).not.toContain('1024.00')
    view.unmount()
  })
  it('selects the packed branch rather than using the original timestamp', async () => {
    const view = mount(ProfileFlameChart, {
      props: {
        durationMs: 1100,
        segments: [
          { frameId: 0, name: 'run', start: 0, end: 20, depth: 0 },
          { frameId: 1, name: 'render', start: 0, end: 8, depth: 1 },
          { frameId: 2, name: 'request', resource: '/api.ts', start: 8, end: 20, depth: 1 },
          { frameId: 0, name: 'run', start: 1000, end: 1020, depth: 0 },
          { frameId: 2, name: 'request', resource: '/api.ts', start: 1000, end: 1020, depth: 1 },
        ],
      },
    })
    const canvas = view.get('canvas')
    Object.defineProperty(canvas.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 80 }),
    })
    const range = view.get('[data-time-range]').text()
    await canvas.trigger('click', { clientX: 10, clientY: 40 })
    expect(view.get('aside').text()).toContain('request')
    expect(view.get('aside').text()).toContain('32.00')
    expect(view.get('[data-time-range]').text()).toBe(range)
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
  it('merges repeated function names and searches without retaining parent rows', async () => {
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
    await view.get('[data-view="tree"]').trigger('click')
    expect(view.findAll('[data-call-row]')).toHaveLength(2)
    expect(view.findAll('[data-select-call="1"]')).toHaveLength(1)
    await view.get('[aria-label="Find frames"]').setValue('RENDER')
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    await view.get('[aria-label="Find frames"]').setValue('missing')
    expect(view.findAll('[data-call-row]')).toHaveLength(0)
    view.unmount()
  })
  it('omits blank names and merges recursive intervals without double-counting time', async () => {
    setLocale('en')
    const view = mount(ProfileFlameChart, {
      props: {
        durationMs: 100,
        segments: [
          { frameId: 0, name: '', start: 0, end: 50, depth: 0 },
          { frameId: 1, name: '  ', start: 0, end: 50, depth: 1 },
          { frameId: 2, name: 'render', start: 0, end: 10, depth: 2 },
          { frameId: 3, name: 'render', start: 2, end: 8, depth: 3 },
          { frameId: 4, name: ' render ', resource: '/second.ts', start: 20, end: 40, depth: 1 },
        ],
      },
    })
    await view.get('[data-view="tree"]').trigger('click')
    expect(view.findAll('[data-call-row]')).toHaveLength(1)
    const row = view.get('[data-call-row]')
    expect(row.get('[data-interval-count]').text()).toBe('2')
    expect(row.get('[data-average-duration]').text()).toBe('15.00 ms')
    expect(row.get('[data-total-duration]').text()).toBe('30.00 ms')
    expect(view.findAll('[data-frame]').map((button) => button.text())).toEqual(['render'])
    await row.get('[data-select-call]').trigger('click')
    expect(view.get('aside').text()).toContain('/second.ts')
    expect(view.get('aside').text()).toContain('30.00')
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
    await view.get('[data-view="tree"]').trigger('click')
    expect(view.findAll('[data-call-row]')).toHaveLength(200)
    await view.get('[data-select-call="0"]').trigger('click')
    expect(view.get('aside').text()).toContain('call-0')
    await view.setProps({ segments: [], durationMs: 0 })
    expect(view.get('[data-testid="sampling-coverage"]').text()).toContain('0.0%')
    expect(view.text()).not.toContain('call-0')
    view.unmount()
  })
})
