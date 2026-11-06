import { flushPromises, type VueWrapper } from '@vue/test-utils'
import QuerySearchBar from '@/features/monitoring/components/QuerySearchBar.vue'

export function queryBar(view: VueWrapper, label?: string) {
  return view.findAllComponents(QuerySearchBar).find((v) => !label || v.props('label') === label)!
}
export async function addQuery(
  view: VueWrapper,
  field: string,
  operator: string,
  value: string,
  label?: string,
) {
  const bar = queryBar(view, label)
  const input = bar.get('input')
  await input.trigger('focus')
  await input.setValue(field)
  await bar.get(`[role="option"][data-value="${field}"]`).trigger('click')
  await bar.get(`[role="option"][data-value="${operator}"]`).trigger('click')
  if (operator !== 'not_exists') {
    await input.setValue(value)
    await input.trigger('keydown', { key: 'Enter' })
  }
  await flushPromises()
}
