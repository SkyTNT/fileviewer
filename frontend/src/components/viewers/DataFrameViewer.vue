<script setup>
import { ref, computed, nextTick } from 'vue'
import { dataframeApi } from '../../services/api.js'
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
const suggestionListRef = ref(null)
const suggestions     = ref([])   // [{ label, insert, kind, detail }]
const suggestionIdx   = ref(-1)
const showSuggestions = ref(false)
const wordStart       = ref(0)

const SQL_FUNCTIONS = [
  'ABS', 'AVG', 'CAST', 'CEIL', 'COALESCE', 'COUNT', 'DATE',
  'DAY', 'FLOOR', 'LENGTH', 'LOWER', 'LTRIM', 'MAX', 'MIN',
  'MONTH', 'NULLIF', 'ROUND', 'RTRIM', 'STRFTIME', 'SUBSTR',
  'SUM', 'TRIM', 'UPPER', 'YEAR',
]

// Suggestions shown after a column name
const OPERATOR_SUGGESTIONS = [
  { label: '=',           insert: '= ',            kind: 'operator', detail: 'equals' },
  { label: '!=',          insert: '!= ',           kind: 'operator', detail: 'not equals' },
  { label: '>',           insert: '> ',            kind: 'operator', detail: 'greater than' },
  { label: '<',           insert: '< ',            kind: 'operator', detail: 'less than' },
  { label: '>=',          insert: '>= ',           kind: 'operator', detail: 'greater or equal' },
  { label: '<=',          insert: '<= ',           kind: 'operator', detail: 'less or equal' },
  { label: '+',           insert: '+ ',            kind: 'operator', detail: 'add' },
  { label: '-',           insert: '- ',            kind: 'operator', detail: 'subtract' },
  { label: '*',           insert: '* ',            kind: 'operator', detail: 'multiply' },
  { label: '/',           insert: '/ ',            kind: 'operator', detail: 'divide' },
  { label: 'LIKE',        insert: 'LIKE ',         kind: 'keyword',  detail: 'pattern match' },
  { label: 'ILIKE',       insert: 'ILIKE ',        kind: 'keyword',  detail: 'case-insensitive' },
  { label: 'BETWEEN',     insert: 'BETWEEN ',      kind: 'keyword',  detail: 'range' },
  { label: 'IN',          insert: 'IN (',          kind: 'keyword',  detail: 'in list' },
  { label: 'NOT IN',      insert: 'NOT IN (',      kind: 'keyword',  detail: 'not in list' },
  { label: 'IS NULL',     insert: 'IS NULL',       kind: 'keyword',  detail: 'is null' },
  { label: 'IS NOT NULL', insert: 'IS NOT NULL',   kind: 'keyword',  detail: 'is not null' },
  { label: 'AND',         insert: 'AND ',          kind: 'keyword',  detail: '' },
  { label: 'OR',          insert: 'OR ',           kind: 'keyword',  detail: '' },
]

// Suggestions shown after a comparison operator
const VALUE_SUGGESTIONS = [
  { label: 'NULL',  insert: 'NULL',  kind: 'keyword', detail: '' },
  { label: 'TRUE',  insert: 'TRUE',  kind: 'keyword', detail: '' },
  { label: 'FALSE', insert: 'FALSE', kind: 'keyword', detail: '' },
]

// Suggestions shown after a value / closing expression
const CONJUNCTION_SUGGESTIONS = [
  { label: 'AND', insert: 'AND ', kind: 'keyword', detail: '' },
  { label: 'OR',  insert: 'OR ',  kind: 'keyword', detail: '' },
]

// Determine what kind of token precedes the current word
function detectContext(textBeforeWord) {
  const t = textBeforeWord.trimEnd()
  if (!t) return 'start'

  if (/"[^"]*"$/.test(t))                          return 'after_column'
  if (/[!=<>]+$/.test(t))                          return 'after_operator'
  if (/\b(LIKE|ILIKE|BETWEEN)$/i.test(t))          return 'after_operator'
  if (/\b(NULL|TRUE|FALSE)$/i.test(t))             return 'after_value'
  if (/'[^']*'$/.test(t))                          return 'after_value'
  if (/(?<![a-zA-Z_])\d+(\.\d+)?$/.test(t))       return 'after_value'
  if (/[)]$/.test(t))                              return 'after_value'
  if (/\b(AND|OR)$/i.test(t))                      return 'start'
  if (/\bNOT$/i.test(t))                           return 'start'
  if (/[,(]$/.test(t))                             return 'start'
  if (/\b[a-zA-Z_][\w.]*$/.test(t))               return 'after_column'
  return 'start'
}

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
  const el = filterFieldRef.value?.$el?.querySelector('input')
  if (!el) return
  const text   = el.value
  const cursor = el.selectionStart ?? text.length

  // Walk back over word chars and dots (for nested column paths)
  let s = cursor
  while (s > 0 && /[\w.]/.test(text[s - 1])) s--
  wordStart.value  = s
  const word       = text.slice(s, cursor)
  const textBefore = text.slice(0, s)
  const context    = detectContext(textBefore)

  // Nothing typed at all → hide
  if (!word && !textBefore.trim()) {
    showSuggestions.value = false
    return
  }
  // No word typed, start context (cursor right after opening) → hide
  if (!word && context === 'start') {
    showSuggestions.value = false
    return
  }

  const lower = word.toLowerCase()
  const pfx   = (label) => !word || label.toLowerCase().startsWith(lower)
  const sub   = (path)  => !word || path.toLowerCase().includes(lower)
  const items = []

  if (context === 'after_column') {
    for (const op of OPERATOR_SUGGESTIONS)
      if (pfx(op.label)) items.push(op)

  } else if (context === 'after_operator') {
    for (const v of VALUE_SUGGESTIONS)
      if (pfx(v.label)) items.push(v)
    for (const { path, dtype } of allPaths.value)
      if (sub(path)) items.push({ label: path, insert: quoteCol(path), kind: 'column', detail: shortDtype(dtype) })
    for (const fn of SQL_FUNCTIONS)
      if (pfx(fn)) items.push({ label: fn + '()', insert: fn + '(', kind: 'function', detail: '' })

  } else if (context === 'after_value') {
    for (const kw of CONJUNCTION_SUGGESTIONS)
      if (pfx(kw.label)) items.push(kw)

  } else {
    // start: columns first, then NOT, then functions
    for (const { path, dtype } of allPaths.value)
      if (sub(path)) items.push({ label: path, insert: quoteCol(path), kind: 'column', detail: shortDtype(dtype) })
    if (pfx('NOT')) items.push({ label: 'NOT', insert: 'NOT ', kind: 'keyword', detail: '' })
    for (const fn of SQL_FUNCTIONS)
      if (pfx(fn)) items.push({ label: fn + '()', insert: fn + '(', kind: 'function', detail: '' })
  }

  suggestions.value   = items.slice(0, 16)
  suggestionIdx.value = -1
  showSuggestions.value = items.length > 0
}

function scrollSuggestionIntoView() {
  nextTick(() => {
    const list = suggestionListRef.value?.$el
    if (!list) return
    const items = list.querySelectorAll('.v-list-item')
    items[suggestionIdx.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

const skipNextBlur = ref(false)

function onFilterKeydown(e) {
  if (e.key === 'Tab' && !showSuggestions.value) {
    e.preventDefault()
    e.stopPropagation()
    if (!filterInput.value.trim()) {
      // Empty input: show all columns + NOT + functions (start context, no filter)
      const items = [
        ...allPaths.value.map(({ path, dtype }) => ({ label: path, insert: quoteCol(path), kind: 'column', detail: shortDtype(dtype) })),
        { label: 'NOT', insert: 'NOT ', kind: 'keyword', detail: '' },
        ...SQL_FUNCTIONS.map(fn => ({ label: fn + '()', insert: fn + '(', kind: 'function', detail: '' })),
      ]
      suggestions.value     = items.slice(0, 16)
      suggestionIdx.value   = -1
      showSuggestions.value = suggestions.value.length > 0
    } else {
      onFilterInput()
    }
    return
  }
  if (!showSuggestions.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    suggestionIdx.value = Math.min(suggestionIdx.value + 1, suggestions.value.length - 1)
    scrollSuggestionIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    suggestionIdx.value = Math.max(suggestionIdx.value - 1, -1)
    scrollSuggestionIntoView()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    const idx = suggestionIdx.value >= 0 ? suggestionIdx.value : 0
    selectSuggestion(suggestions.value[idx])
  } else if (e.key === 'Enter' && suggestionIdx.value >= 0) {
    e.preventDefault()
    selectSuggestion(suggestions.value[suggestionIdx.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

function onFilterBlur() {
  if (skipNextBlur.value) {
    skipNextBlur.value = false
    return
  }
  showSuggestions.value = false
}

function quoteCol(col) {
  return /[^a-zA-Z0-9_]/.test(col) ? `"${col}"` : col
}

function selectSuggestion(item) {
  const el = filterFieldRef.value?.$el?.querySelector('input')
  if (!el) return
  const cursor = el.selectionStart ?? filterInput.value.length
  const before = filterInput.value.slice(0, wordStart.value)
  const after  = filterInput.value.slice(cursor)
  filterInput.value = before + item.insert + after
  showSuggestions.value = false
  nextTick(() => {
    const pos = wordStart.value + item.insert.length
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
    const res    = await dataframeApi.getSchema(filePath.value)
    schema.value = res.data.columns.map((c, i) => ({ name: c, dtype: res.data.dtypes[i] }))
    schemaTree.value = res.data.schema_tree ?? []
  } catch {} // schema is supplementary — data loads independently via loadParquet
}

async function loadParquet() {
  loading.value = true
  error.value   = null
  try {
    const res     = await dataframeApi.getData(filePath.value, {
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
            <v-list ref="suggestionListRef" density="compact" nav min-width="300" max-height="280">
              <v-list-item
                v-for="(item, idx) in suggestions"
                :key="item.label"
                :active="idx === suggestionIdx"
                color="primary"
                rounded="lg"
                @mousedown.prevent
                @click="selectSuggestion(item)"
              >
                <template #prepend>
                  <v-icon size="14" class="mr-1" :color="{ column: 'primary', keyword: 'warning', function: 'deep-purple', operator: 'teal' }[item.kind]">
                    {{ { column: 'mdi-table-column', keyword: 'mdi-code-tags', function: 'mdi-function', operator: 'mdi-approximately-equal' }[item.kind] }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-body-2" style="font-family:monospace">
                  {{ item.label }}
                </v-list-item-title>
                <template #append>
                  <v-chip v-if="item.detail" size="x-small" variant="tonal" label>{{ item.detail }}</v-chip>
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
