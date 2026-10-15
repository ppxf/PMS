<script setup lang="ts" generic="TData extends RowData">
import { computed, ref, watch } from 'vue'
import { ArrowUpDown, ChevronLeft, ChevronRight, LoaderCircle } from '@lucide/vue'
import { FlexRender, useTable } from '@tanstack/vue-table'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import FormSelect from '@/components/ui/select/FormSelect.vue'
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
    rowClass?: (row: TData) => string | undefined
    selectable?: boolean
    sorting?: SortingState
    total?: number
  }>(),
  {
    emptyText: 'No data available',
    error: null,
    loading: false,
    manualPagination: false,
    page: 1,
    pageSize: 10,
    rowKey: undefined,
    rowClass: undefined,
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

function changePageSize(size: number): void {
  emit('update:pageSize', size)
  emit('update:page', 1)
}
</script>

<template>
  <div class="space-y-4">
    <Alert v-if="error" variant="destructive">
      <AlertTitle>Failed to load data</AlertTitle>
      <AlertDescription class="flex items-center justify-between gap-4">
        <span>{{ error }}</span>
        <Button type="button" variant="outline" size="sm" @click="emit('retry')"> Retry </Button>
      </AlertDescription>
    </Alert>

    <div class="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead v-if="selectable" class="w-12">
              <Checkbox
                aria-label="Select all rows"
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
                <span class="sr-only">Loading data</span>
              </TableCell>
            </TableRow>
          </template>

          <template v-else-if="visibleRows.length">
            <TableRow
              v-for="row in visibleRows"
              :key="row.id"
              :data-state="row.getIsSelected() ? 'selected' : undefined"
              :class="rowClass?.(row.original)"
            >
              <TableCell v-if="selectable">
                <Checkbox
                  :aria-label="`Select row ${row.index + 1}`"
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
        {{ totalRows }} rows, page {{ currentPage }} of {{ pageCount }}
      </p>

      <div class="flex items-center gap-2">
        <label class="text-sm text-muted-foreground" for="data-table-page-size">
          Rows per page
        </label>
        <FormSelect
          id="data-table-page-size"
          :model-value="pageSize"
          :options="[10, 20, 50, 100].map((size) => ({ value: size, label: String(size) }))"
          aria-label="Rows per page"
          class="w-20"
          @change="changePageSize"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          :disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="changePage(currentPage - 1)"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          :disabled="currentPage >= pageCount"
          aria-label="Next page"
          @click="changePage(currentPage + 1)"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  </div>
</template>
