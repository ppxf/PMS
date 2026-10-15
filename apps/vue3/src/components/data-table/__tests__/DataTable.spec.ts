import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { selectValue } from '@/test/select'
import DataTable from '../DataTable.vue'

enableAutoUnmount(afterEach)

describe('DataTable pagination', () => {
  it('changes page size through the accessible menu and resets the page', async () => {
    const view = mount(DataTable, {
      attachTo: document.body,
      props: { columns: [], data: [], page: 3, pageSize: 10, total: 100 },
    })
    await selectValue(view, 'Rows per page', 20)
    expect(view.emitted('update:pageSize')).toEqual([[20]])
    expect(view.emitted('update:page')).toEqual([[1]])
  })
})
