import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount, DOMWrapper, flushPromises } from '@vue/test-utils'
import MetricOptionPicker from '../../components/MetricOptionPicker.vue'
enableAutoUnmount(afterEach)
const menu = () => new DOMWrapper(document.querySelector<HTMLElement>('[data-slot=picker-content]'))
describe('searchable typed metric options', () => {
  it('keeps text caret keys available while arrow keys navigate menu choices', async () => {
    const view = mount(MetricOptionPicker, {
      attachTo: document.body,
      props: {
        modelValue: '',
        label: 'Metric',
        searchLabel: 'Search metrics',
        options: [{ key: 'stock', label: 'Stock', type: 'gauge' }],
      },
    })
    await view.get('[role=combobox]').trigger('click')
    await flushPromises()
    const input = menu().get('input').element
    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    input.dispatchEvent(home)
    expect(home.defaultPrevented).toBe(false)
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    input.dispatchEvent(down)
    expect(document.activeElement?.getAttribute('role')).toBe('option')
  })
  it('searches actual metric names and shows type and unit badges', async () => {
    const view = mount(MetricOptionPicker, {
      attachTo: document.body,
      props: {
        modelValue: '',
        label: 'Metric',
        searchLabel: 'Search metrics',
        options: [
          { key: 'stock', label: 'inventory.stock', type: 'gauge', unit: 'none' },
          { key: 'latency', label: 'checkout.latency', type: 'distribution', unit: 'millisecond' },
        ],
      },
    })
    await view.get('[role=combobox]').trigger('click')
    await flushPromises()
    await menu().get('input[aria-label="Search metrics"]').setValue('checkout')
    expect(menu().findAll('[role="option"]')).toHaveLength(1)
    expect(menu().text()).toContain('distribution')
    expect(menu().text()).toContain('millisecond')
    expect(menu().text()).not.toContain('button_click')
    await menu().get('[role="option"]').trigger('click')
    expect(view.emitted('update:modelValue')).toEqual([['latency']])
  })
  it('preserves selected group dimensions when searching and adding another typed field', async () => {
    const view = mount(MetricOptionPicker, {
      attachTo: document.body,
      props: {
        modelValue: ['browser.name'],
        multiple: true,
        label: 'Group by',
        searchLabel: 'Search group fields',
        options: [
          { key: 'browser.name', label: 'browser.name', type: 'string' },
          { key: 'value', label: 'value', type: 'number' },
        ],
      },
    })
    await view.get('[role=combobox]').trigger('click')
    await flushPromises()
    await menu().get('input[aria-label="Search group fields"]').setValue('value')
    expect(menu().text()).toContain('number')
    await menu().get('input[aria-label="Group by value"]').setValue(true)
    expect(view.emitted('update:modelValue')).toEqual([[['browser.name', 'value']]])
  })
})
