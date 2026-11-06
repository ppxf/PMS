import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import QuerySearchBar from '../../components/QuerySearchBar.vue'

it('focuses an explicit value input and accepts a value absent from suggestions', async () => {
  const view = mount(QuerySearchBar, {
    attachTo: document.body,
    props: { fields: [{ key: 'name', operators: ['eq'] }], activeField: 'name' },
  })
  await view.get('input').trigger('focus')
  await view.get('[data-value="name"]').trigger('click')
  await view.get('[data-value="eq"]').trigger('click')
  const value = view.get('input[aria-label="Condition value"]')
  expect(value.element.closest('[data-query-panel]')).not.toBeNull()
  expect(document.activeElement).toBe(value.element)
  await value.setValue('custom.metric')
  await value.trigger('keydown', { key: 'Enter' })
  expect(view.emitted('condition')).toEqual([
    [{ field: 'name', operator: 'eq', value: 'custom.metric' }],
  ])
  view.unmount()
})

it('builds a condition in field, operator, value order without an editor form', async () => {
  const view = mount(QuerySearchBar, {
    props: {
      fields: [{ key: 'environment', type: 'string', operators: ['eq', 'in'] }],
      activeField: 'environment',
      suggestions: { environment: ['production'] },
    },
  })
  const input = view.get('[role="combobox"]')
  await input.trigger('focus')
  await view.get('[role="option"]').trigger('click')
  expect(view.text()).toContain('is')
  await view.get('[role="option"]').trigger('click')
  expect(view.text()).toContain('production')
  await view.get('[role="option"]').trigger('click')
  expect(view.emitted('condition')).toEqual([
    [{ field: 'environment', operator: 'eq', value: 'production' }],
  ])
  expect(view.find('form').exists()).toBe(false)
  view.unmount()
})

it('supports manual multi-values, backtracking and existence without a value', async () => {
  const view = mount(QuerySearchBar, {
    props: {
      fields: [{ key: 'environment', operators: ['in', 'exists'] }],
      activeField: 'environment',
    },
  })
  const input = view.get('input')
  await input.trigger('focus')
  await input.trigger('keydown', { key: 'Enter' })
  await input.trigger('keydown', { key: 'Enter' })
  await input.trigger('keydown', { key: 'Backspace' })
  expect(view.text()).toContain('Choose an operator')
  await input.trigger('keydown', { key: 'Enter' })
  await input.setValue('production, staging')
  await input.trigger('keydown', { key: 'Enter' })
  expect(view.emitted('condition')?.[0]).toEqual([
    { field: 'environment', operator: 'in', value: 'production, staging' },
  ])
  await input.trigger('focus')
  await input.trigger('keydown', { key: 'Enter' })
  await view.get('[data-value="exists"]').trigger('click')
  expect(view.emitted('condition')?.[1]).toEqual([
    { field: 'environment', operator: 'exists', value: '' },
  ])
  view.unmount()
})
