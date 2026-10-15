import { DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils'

export async function openSelect(view: VueWrapper, label: string) {
  const trigger = view.get(`[role="combobox"][aria-label="${label}"]`)
  if (trigger.attributes('aria-expanded') !== 'true') {
    await trigger.trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }
  return new DOMWrapper(document.querySelector<HTMLElement>('[role="listbox"]'))
}
export async function selectValue(view: VueWrapper, label: string, value: string | number) {
  const menu = await openSelect(view, label)
  const option = menu
    .findAll('[role="option"]')
    .find((item) => item.attributes('data-value') === String(value))
  if (!option) throw new Error(`No option ${value} in ${label}`)
  await option.trigger('keydown', { key: 'Enter' })
  await flushPromises()
}
