import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import FormSelect from './FormSelect.vue'

enableAutoUnmount(afterEach)
describe('FormSelect value contracts', () => {
  it('supports an empty-valued None option without leaking an internal value', async () => {
    const view = mount(FormSelect, {
      props: {
        modelValue: 'browser.name',
        options: [
          { value: '', label: 'None' },
          { value: 'browser.name', label: 'Browser' },
        ],
      },
      attachTo: document.body,
    })
    await view.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    document
      .querySelector<HTMLElement>('[role="option"][data-value=""]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(view.emitted('update:modelValue')).toEqual([['']])
  })
  it('keeps numeric zero and emits the numeric value before change', async () => {
    const view = mount(FormSelect, {
      props: {
        modelValue: 60,
        options: [
          { value: 60, label: 'Minute' },
          { value: 0, label: 'Auto' },
        ],
      },
      attrs: { 'aria-label': 'Interval' },
      attachTo: document.body,
    })
    await view.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const option = document.querySelector<HTMLElement>('[role="option"][data-value="0"]')!
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(view.emitted('update:modelValue')).toEqual([[0]])
    expect(view.emitted('change')).toEqual([[0]])
  })
  it('keeps string values distinct from numeric values and disables unavailable choices', async () => {
    const view = mount(FormSelect, {
      props: {
        modelValue: '60',
        options: [
          { value: '60', label: 'String minute' },
          { value: '0', label: 'String auto' },
          { value: 'blocked', label: 'Unavailable', disabled: true },
        ],
      },
      attachTo: document.body,
    })
    await view.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('[data-value="blocked"]')?.getAttribute('aria-disabled')).toBe(
      'true',
    )
    document
      .querySelector<HTMLElement>('[role="option"][data-value="0"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(view.emitted('update:modelValue')).toEqual([['0']])
  })
})
