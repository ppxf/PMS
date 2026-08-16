<script setup lang="ts" generic="TData extends RowData">
import { computed, ref, watch } from 'vue'
import { ArrowUpDown, ChevronLeft, ChevronRight, LoaderCircle } from '@lucide/vue'
import { FlexRender, useTable } from '@tanstack/vue-table'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dataTableFeatures } from './features'

import type { ColumnDef, RowData, RowSelectionState, SortingState } from '@tanstack/vue-table'
import type { DataTableFeatures } from './features'

defineOptions({ name: 'DataTable' })

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<DataTableFeatures, TData>[]
    data: TData[]
    emptyText?: string
    error?: string | null
    loading?: boolean
    manualPagination?: boolean
    page?: number
    pageSize?: number
    rowKey?: (row: TData) => string
    selectable?: boolean
    sorting?: SortingState
    total?: number
  }>(),
  {
    emptyText: '暂无数据',
    error: null,
    loading: false,
    manualPagination: false,
    page: 1,
    pageSize: 10,
    rowKey: undefined,
    selectable: false,
    sorting: () => [],
    total: undefined,
  },
)

const emit = defineEmits<{
  retry: []
  'selection-change': [rows: TData[]]
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
  'update:sorting': [sorting: SortingState]
}>()

const rowSelection = ref<RowSelectionState>({})
const sortingState = ref<SortingState>([...props.sorting])

watch(
  () => props.sorting,
  (sorting) => {
    sortingState.value = [...sorting]
  },
  { deep: true },
)

const table = useTable<DataTableFeatures, TData>({
  features: dataTableFeatures,
  get columns() {
    return props.columns
  },
  get data() {
    return props.data
  },
  getRowId(row, index) {
    return props.rowKey?.(row) ?? String(index)
  },
  state: {
    get rowSelection() {
      return rowSelection.value
    },
    get sorting() {
      return sortingState.value
    },
  },
  onRowSelectionChange(updater) {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater
  },
  onSortingChange(updater) {
    sortingState.value = typeof updater === 'function' ? updater(sortingState.value) : updater
    emit('update:sorting', sortingState.value)
  },
})

watch(
  rowSelection,
  () => {
    const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
    emit('selection-change', selectedRows)
  },
  { deep: true },
)

const columnCount = computed(() => props.columns.length + (props.selectable ? 1 : 0))
const totalRows = computed(() => props.total ?? table.getRowModel().rows.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / props.pageSize)))
const currentPage = computed(() => Math.min(Math.max(props.page, 1), pageCount.value))
const visibleRows = computed(() => {
  const rows = table.getRowModel().rows

  if (props.manualPagination) {
    return rows
  }

  const start = (currentPage.value - 1) * props.pageSize
  return rows.slice(start, start + props.pageSize)
})

function changePage(page: number): void {
  const nextPage = Math.min(Math.max(page, 1), pageCount.value)

  if (nextPage !== currentPage.value) {
    emit('update:page', nextPage)
  }
}

function changePageSize(event: Event): void {
  const target = event.target as HTMLSelectElement
  emit('update:pageSize', Number(target.value))
  emit('update:page', 1)
}
</script>

<template>
  <div class="space-y-4">
    <Alert v-if="error" variant="destructive">
      <AlertTitle>数据加载失败</AlertTitle>
      <AlertDescription class="flex items-center justify-between gap-4">
        <span>{{ error }}</span>
        <Button type="button" variant="outline" size="sm" @click="emit('retry')"> 重试 </Button>
      </AlertDescription>
    </Alert>

    <div class="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead v-if="selectable" class="w-12">
              <Checkbox
                aria-label="选择全部行"
                :model-value="
                  table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && 'indeterminate')
                "
                @update:model-value="table.toggleAllRowsSelected(Boolean($event))"
              />
            </TableHead>
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :aria-sort="
                header.column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : header.column.getIsSorted() === 'desc'
                    ? 'descending'
                    : 'none'
              "
            >
              <button
                v-if="!header.isPlaceholder && header.column.getCanSort()"
                type="button"
                class="inline-flex items-center gap-2 font-medium hover:text-foreground"
                @click="header.column.toggleSorting(header.column.getIsSorted() === 'asc')"
              >
                <FlexRender :header="header" />
                <ArrowUpDown class="size-3.5 text-muted-foreground" />
              </button>
              <FlexRender v-else-if="!header.isPlaceholder" :header="header" />
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <template v-if="loading">
            <TableRow v-for="rowIndex in 5" :key="rowIndex">
              <TableCell :colspan="columnCount" class="h-12 animate-pulse bg-muted/40">
                <span class="sr-only">正在加载数据</span>
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="visibleRows.length">
            <TableRow
              v-for="row in visibleRows"
              :key="row.id"
              :data-state="row.getIsSelected() ? 'selected' : undefined"
            >
              <TableCell v-if="selectable">
                <Checkbox
                  :aria-label="`选择第 ${row.index + 1} 行`"
                  :model-value="row.getIsSelected()"
                  @update:model-value="row.toggleSelected(Boolean($event))"
                />
              </TableCell>
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender :cell="cell" />
              </TableCell>
            </TableRow>
          </template>

          <TableRow v-else>
            <TableCell :colspan="columnCount" class="h-32 text-center">
              <div class="flex flex-col items-center gap-2 text-muted-foreground">
                <LoaderCircle v-if="loading" class="size-5 animate-spin" />
                <span>{{ emptyText }}</span>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-foreground">
        共 {{ totalRows }} 条，第 {{ currentPage }} / {{ pageCount }} 页
      </p>

      <div class="flex items-center gap-2">
        <label class="text-sm text-muted-foreground" for="data-table-page-size"> 每页 </label>
        <select
          id="data-table-page-size"
          :value="pageSize"
          class="h-8 rounded-md border bg-background px-2 text-sm"
          @change="changePageSize"
        >
          <option v-for="size in [10, 20, 50, 100]" :key="size" :value="size">
            {{ size }}
          </option>
        </select>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          :disabled="currentPage <= 1"
          aria-label="上一页"
          @click="changePage(currentPage - 1)"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          :disabled="currentPage >= pageCount"
          aria-label="下一页"
          @click="changePage(currentPage + 1)"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  </div>
</template>
