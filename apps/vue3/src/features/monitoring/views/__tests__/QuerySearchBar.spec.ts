import { afterEach, expect, it } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import QuerySearchBar from '../../components/QuerySearchBar.vue'
enableAutoUnmount(afterEach)
const fields = [
  { key: 'environment', type: 'string', operators: ['eq', 'in'] },
  { key: 'browser.web_vital.lcp.value', type: 'number', operators: ['gt', 'exists'] },
]
it('searches typed fields and selects a field using the keyboard', async () => {
  const view = mount(QuerySearchBar, {
    props: { fields, activeField: 'environment' },
  })
  const input = view.get('[role="combobox"]')
  await input.trigger('focus')
  await input.setValue('lcp')
  expect(view.findAll('[role="option"]')).toHaveLength(1)
  expect(view.get('[role="option"]').text()).toContain('number')
  await input.trigger('keydown', { key: 'Enter' })
  expect(view.emitted('select')).toEqual([['browser.web_vital.lcp.value']])
  await input.trigger('keydown', { key: 'Escape' })
  expect(input.attributes('aria-expanded')).toBe('false')
})
it('preserves condition controls and closes on outside pointer interaction', async () => {
  const view = mount(QuerySearchBar, {
    attachTo: document.body,
    props: { fields, activeField: 'environment' },
    slots: {
      conditions: '<button>environment eq production ×</button>',
    },
  })
  await view.get('[role="combobox"]').trigger('focus')
  expect(view.text()).toContain('environment eq production')
  expect(view.find('form').exists()).toBe(false)
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await view.vm.$nextTick()
  expect(view.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
})
