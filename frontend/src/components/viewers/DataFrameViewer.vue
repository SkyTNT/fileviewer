<script setup>
import { ref, computed, nextTick } from 'vue'
import { parquetApi } from '../../services/api.js'
import JsonNode from './JsonNode.vue'

const dialog   = ref(false)
const fileName = ref('')
const filePath = ref('')
const fileType = ref('parquet')

const columns  = ref([])
const dtypes   = ref([])
const rows     = ref([])
const total    = ref(0)
const page     = ref(1)
const pageSize = ref(100)
const sortCol  = ref(null)
const sortAsc  = ref(true)
const loading  = ref(false)
const error    = ref(null)
const schema   = ref([])

// Parquet-only filter
const filterInput    = ref('')
const filterSql      = ref('')

// Autocomplete
const filterFieldRef  = ref(null)
const wrapperRef      = ref(null)
const suggestions     = ref([])
const suggestionIdx   = ref(-1)
const showSuggestions = ref(false)
const wordStart       = ref(0)

// Flat list of all dotted paths built from schema_tree
const schemaTree = ref([])

const allPaths = computed(() => {
  const result = []
  function collect(fields, prefix) {
    for (const f of fields) {
      const path = prefix ? `${prefix}.${f.name}` : f.name
      result.push({ path, dtype: f.dtype })
      if (f.fields?.length) collect(f.fields, path)
    }
  }
  collect(schemaTree.value, '')
  return result
})

function getDtype(path) {
  return allPaths.value.find(p => p.path === path)?.dtype ?? ''
}

function shortDtype(dtype) {
  if (!dtype) return ''
  if (dtype.startsWith('Struct')) return 'Struct'
  if (dtype.startsWith('List'))   return 'List'
  if (dtype.startsWith('Array'))  return 'Array'
  return dtype
}

function displayValue(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function onFilterInput() {
  const el     = filterFieldRef.value?.$el?.querySelector('input')
  if (!el) return
  const text   = el.value
  const cursor = el.selectionStart ?? text.length

  // Walk back — include dots so "image.ye" is one token
  let s = cursor
  while (s > 0 && /[\w.]/.test(text[s - 1])) s--
  wordStart.value = s
  const word = text.slice(s, cursor)

  if (word.length === 0) {
    showSuggestions.value = false
    return
  }
  const lower = word.toLowerCase()
  suggestions.value   = allPaths.value
    .map(p => p.path)
    .filter(p => p.toLowerCase().includes(lower))
    .slice(0, 14)
  suggestionIdx.value = -1
  showSuggestions.value = suggestions.value.length > 0
}

function onFilterKeydown(e) {
  if (!showSuggestions.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestionIdx.value = Math.min(suggestionIdx.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestionIdx.value = Math.max(suggestionIdx.value - 1, -1)
  } else if (e.key === 'Enter' && suggestionIdx.value >= 0) {
    e.preventDefault()
    selectSuggestion(suggestions.value[suggestionIdx.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

function onFilterBlur() {
  // @mousedown.prevent on list items keeps input focused during selection,
  // so blur only fires when truly leaving the field
  showSuggestions.value = false
}

function selectSuggestion(col) {
  const el = filterFieldRef.value?.$el?.querySelector('input')
  if (!el) return
  const cursor  = el.selectionStart ?? filterInput.value.length
  const before  = filterInput.value.slice(0, wordStart.value)
  const after   = filterInput.value.slice(cursor)
  filterInput.value = before + col + after
  showSuggestions.value = false
  nextTick(() => {
    const pos = wordStart.value + col.length
    el.setSelectionRange(pos, pos)
    el.focus()
  })
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// ── open ────────────────────────────────────────────────────────────────────
async function open(file, type = 'parquet') {
  fileType.value    = type
  filePath.value    = file.path
  fileName.value    = file.name
  page.value        = 1
  sortCol.value     = null
  sortAsc.value     = true
  filterInput.value = ''
  filterSql.value   = ''
  columns.value     = []
  rows.value        = []
  schema.value      = []
  error.value       = null
  dialog.value      = true

  await loadSchema()
  await loadParquet()
}

// ── Server-side pagination, SQL filter, sort (parquet + jsonl) ───────────────
async function loadSchema() {
  try {
    const res    = await parquetApi.getSchema(filePath.value)
    schema.value = res.data.columns.map((c, i) => ({ name: c, dtype: res.data.dtypes[i] }))
    schemaTree.value = res.data.schema_tree ?? []
  } catch {} // schema is supplementary — data loads independently via loadParquet
}

async function loadParquet() {
  loading.value = true
  error.value   = null
  try {
    const res     = await parquetApi.getData(filePath.value, {
      page:       page.value,
      page_size:  pageSize.value,
      filter_sql: filterSql.value || undefined,
      sort_col:   sortCol.value   || undefined,
      sort_asc:   sortAsc.value,
    })
    columns.value = res.data.columns
    dtypes.value  = res.data.dtypes
    rows.value    = res.data.data
    total.value   = res.data.total
  } catch (e) {
    error.value = e.response?.data?.detail || e.message
  } finally {
    loading.value = false
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────
function applyFilter() {
  filterSql.value = filterInput.value
  page.value = 1
  loadParquet()
}
function clearFilter() {
  filterInput.value = ''
  filterSql.value   = ''
  page.value = 1
  loadParquet()
}

function onSort(col) {
  sortAsc.value = sortCol.value === col ? !sortAsc.value : true
  sortCol.value = col
  page.value    = 1
  loadParquet()
}

function prevPage() {
  if (page.value <= 1) return
  page.value--
  loadParquet()
}
function nextPage() {
  if (page.value >= totalPages.value) return
  page.value++
  loadParquet()
}
function onPageSizeChange() {
  page.value = 1
  loadParquet()
}

// ── Row detail ───────────────────────────────────────────────────────────────
const rowDialog  = ref(false)
const selectedRow = ref(null)

function openRow(row) {
  selectedRow.value = row
  rowDialog.value   = true
}

function close() { dialog.value = false }

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" max-width="1200" scrollable>
    <v-card style="min-height:500px">

      <!-- Title -->
      <v-card-title class="d-flex align-center flex-wrap ga-2">
        <v-icon class="mr-2">mdi-table-large</v-icon>
        {{ fileName }}
        <v-chip size="small" variant="tonal" class="ml-1">
          {{ fileType.toUpperCase() }}
        </v-chip>
        <v-spacer />
        <v-chip size="small" class="mr-2">{{ total.toLocaleString() }} rows</v-chip>
        <v-btn icon size="small" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-divider />

      <!-- SQL filter bar with column autocomplete -->
      <div class="pa-2 d-flex align-center ga-2">
        <div ref="wrapperRef" style="flex:1; max-width:560px;">
          <v-text-field
            ref="filterFieldRef"
            v-model="filterInput"
            density="compact"
            hide-details
            placeholder='WHERE clause, e.g. age > 30 AND name = "Alice"'
            prepend-inner-icon="mdi-filter-outline"
            variant="outlined"
            autocomplete="off"
            @input="onFilterInput"
            @keydown="onFilterKeydown"
            @blur="onFilterBlur"
            @keyup.enter="applyFilter"
          />
          <v-menu
            v-model="showSuggestions"
            :activator="wrapperRef"
            :open-on-click="false"
            :close-on-content-click="false"
            :open-on-hover="false"
            no-click-animation
            offset="2"
          >
            <v-list density="compact" nav min-width="280" max-height="240">
              <v-list-item
                v-for="(col, idx) in suggestions"
                :key="col"
                :active="idx === suggestionIdx"
                color="primary"
                rounded="lg"
                @mousedown.prevent
                @click="selectSuggestion(col)"
              >
                <v-list-item-title class="text-body-2" style="font-family:monospace">
                  {{ col }}
                </v-list-item-title>
                <template #append>
                  <v-chip size="x-small" variant="tonal" label>{{ getDtype(col) }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
        <v-btn size="small" color="primary" @click="applyFilter">Filter</v-btn>
        <v-btn size="small" variant="tonal" @click="clearFilter">Clear</v-btn>
        <v-spacer />
        <v-select
          v-model="pageSize"
          :items="[50, 100, 250, 500]"
          label="Rows/page"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width:110px"
          @update:model-value="onPageSizeChange"
        />
      </div>

      <!-- Schema chips -->
      <div v-if="schema.length" class="px-3 pb-2 d-flex flex-wrap ga-1" style="max-height:72px; overflow-y:auto">
        <v-chip
          v-for="col in schema"
          :key="col.name"
          size="x-small"
          variant="tonal"
          :color="sortCol === col.name ? 'primary' : undefined"
          style="cursor:pointer"
          @click="onSort(col.name)"
        >
          {{ col.name }}
          <span class="text-medium-emphasis ml-1">{{ shortDtype(col.dtype) }}</span>
          <v-icon v-if="sortCol === col.name" size="12" class="ml-1">
            {{ sortAsc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
          </v-icon>
          <v-tooltip activator="parent" location="top">{{ col.dtype }}</v-tooltip>
        </v-chip>
      </div>

      <v-divider />

      <!-- Table -->
      <v-card-text class="pa-0" style="overflow:auto; max-height:58vh">
        <div v-if="loading" class="d-flex justify-center pa-12">
          <v-progress-circular indeterminate />
        </div>
        <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>
        <table v-else-if="rows.length" class="df-table">
          <thead>
            <tr>
              <th
                v-for="(col, i) in columns"
                :key="col"
                :class="{ sorted: sortCol === col }"
                @click="onSort(col)"
              >
                {{ col }}
                <span class="dtype">{{ dtypes[i] }}</span>
                <v-icon v-if="sortCol === col" size="13" class="ml-1">
                  {{ sortAsc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
                </v-icon>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in rows" :key="ri" class="data-row" @dblclick="openRow(row)">
              <td v-for="col in columns" :key="col">{{ displayValue(row[col]) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="text-center text-medium-emphasis pa-12">No data</div>
      </v-card-text>

      <!-- Pagination -->
      <v-divider />
      <v-card-actions class="justify-center ga-2">
        <v-btn icon size="small" variant="tonal" :disabled="page <= 1" @click="prevPage">
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
        <span class="text-body-2">Page {{ page }} / {{ totalPages }}</span>
        <v-btn icon size="small" variant="tonal" :disabled="page >= totalPages" @click="nextPage">
          <v-icon>mdi-chevron-right</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Row detail dialog -->
  <v-dialog v-model="rowDialog" max-width="600" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-code-json</v-icon>
        Row detail
        <v-spacer />
        <v-btn icon size="small" @click="rowDialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-card-text style="max-height:70vh; overflow:auto;">
        <div class="pa-2 tree-bg">
          <JsonNode v-if="selectedRow" :value="selectedRow" :depth="0" />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.df-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.df-table th {
  position: sticky;
  top: 0;
  background: rgb(var(--v-theme-surface));
  padding: 6px 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  user-select: none;
}
.df-table th:hover { background: rgb(var(--v-theme-surface-variant)); }
.df-table th.sorted { color: rgb(var(--v-theme-primary)); }
.dtype { font-size: 10px; opacity: 0.5; margin-left: 4px; }
.df-table td {
  padding: 4px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.5));
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.df-table tr:hover td { background: rgba(var(--v-theme-on-surface), 0.04); }
.data-row { cursor: pointer; }
.tree-bg {
  background: rgb(var(--v-theme-surface));
  border-radius: 6px;
  font-family: 'Roboto Mono', monospace;
}
</style>
