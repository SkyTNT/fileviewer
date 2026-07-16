<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch, inject, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { sql, StandardSQL } from '@codemirror/lang-sql'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete'

const props = defineProps({
  file:       { type: Object, required: true },
  appOpts:    { type: Object, default: () => ({}) },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
  win:        { type: Object, default: null },
})

const services      = inject('services')
const PaginationBar = services.get('ui.pagination-bar')
const appRegistry   = services.get('app.registry')
const dataframeApi  = services.get('dataframe.api')
const imagesApi     = services.get('images.api')
const { t } = useI18n()

const fileType = computed(() => props.appOpts?.type ?? 'parquet')
const menuZ    = computed(() => (props.win?.z ?? 3000) + 1)

const columns  = ref([])
const dtypes   = ref([])
const rows     = ref([])
const total    = ref(0)
const page      = ref(1)
const pageSize  = ref(100)
const sortCol  = ref(null)
const sortAsc  = ref(true)
const loading  = ref(false)
const error    = ref(null)
const schema   = ref([])

const imageCols    = ref({})
const filterSql    = ref('')
const schemaTree   = ref([])
const imgRowHeight = ref(48)

const hasImageCols = computed(() => Object.keys(imageCols.value).length > 0)

// ── CodeMirror SQL editor ─────────────────────────────────────────────────────
const sqlEditorRef      = ref(null)
const schemaCompartment = new Compartment()
let editorView     = null
let pendingColumns = null

function buildSqlExt(columnNames) {
  return sql({ dialect: StandardSQL, schema: { df: columnNames }, defaultTable: 'df', upperCaseKeywords: true })
}

function createEditor(container) {
  editorView = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        history(),
        schemaCompartment.of(buildSqlExt([])),
        autocompletion({ closeOnBlur: true }),
        keymap.of([
          { key: 'Enter', run: (view) => { if (acceptCompletion(view)) return true; applyFilter(); return true } },
          { key: 'Shift-Enter', run: (view) => { view.dispatch(view.state.replaceSelection('\n')); return true } },
          ...completionKeymap, ...defaultKeymap, ...historyKeymap,
        ]),
        placeholder('SELECT * FROM df WHERE age > 30'),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { backgroundColor: 'rgb(var(--v-theme-surface))', color: 'rgb(var(--v-theme-on-surface))', borderRadius: '3px', maxHeight: '120px' },
          '.cm-scroller': { fontFamily: "'Roboto Mono', 'Courier New', monospace", fontSize: '13px', lineHeight: '1.6', overflow: 'auto' },
          '.cm-content': { padding: '6px 10px', minHeight: '26px', caretColor: 'rgb(var(--v-theme-primary))' },
          '.cm-line': { padding: '0' },
          '.cm-focused': { outline: 'none' },
          '.cm-placeholder': { color: 'rgba(var(--v-theme-on-surface), 0.35)', fontStyle: 'italic' },
          '.cm-selectionBackground': { backgroundColor: 'rgba(var(--v-theme-primary), 0.2) !important' },
          '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(var(--v-theme-primary), 0.3) !important' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--v-theme-primary))' },
          '.cm-tooltip': { backgroundColor: 'rgb(var(--v-theme-surface))', color: 'rgb(var(--v-theme-on-surface))', border: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))', borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', overflow: 'hidden' },
          '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: "'Roboto Mono', 'Courier New', monospace", fontSize: '13px' },
          '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px' },
          '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(var(--v-theme-primary), 0.2)', color: 'rgb(var(--v-theme-on-surface))' },
        }),
      ],
    }),
    parent: container,
  })
  if (pendingColumns !== null) updateEditorSchema(pendingColumns)
}

function updateEditorSchema(columnNames) {
  if (!editorView) { pendingColumns = columnNames; return }
  pendingColumns = null
  editorView.dispatch({ effects: schemaCompartment.reconfigure(buildSqlExt(columnNames)) })
}

onMounted(async () => {
  await nextTick()
  if (sqlEditorRef.value) createEditor(sqlEditorRef.value)
  await loadData()
})

onUnmounted(() => { editorView?.destroy() })

watch(() => props.file, async () => {
  page.value = 1; sortCol.value = null; sortAsc.value = true; filterSql.value = ''
  columns.value = []; rows.value = []; schema.value = []; schemaTree.value = []; imageCols.value = {}
  error.value = null
  if (editorView) editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: '' } })
  await loadData()
})

async function loadData() {
  loading.value = true
  await loadSchema()
  await loadParquet()
}

async function loadSchema() {
  try {
    const res = await dataframeApi.getSchema(props.file.path)
    schema.value     = res.data.columns.map((c, i) => ({ name: c, dtype: res.data.dtypes[i] }))
    schemaTree.value = res.data.schema_tree ?? []
    updateEditorSchema(res.data.columns)
  } catch {}
  dataframeApi.detectImageCols(props.file.path)
    .then(res => { imageCols.value = Object.fromEntries(res.data.image_cols.map(({ col, kind }) => [col, kind])) })
    .catch(() => {})
}

async function loadParquet() {
  loading.value = true
  error.value   = null
  try {
    const res = await dataframeApi.getData(props.file.path, {
      page: page.value, page_size: pageSize.value,
      filter_sql: filterSql.value || undefined,
      sort_col: sortCol.value || undefined, sort_asc: sortAsc.value,
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

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function applyFilter() {
  filterSql.value = editorView ? editorView.state.doc.toString().trim() : ''
  page.value = 1; loadParquet()
}

function clearFilter() {
  filterSql.value = ''
  if (editorView) editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: '' } })
  page.value = 1; loadParquet()
}

function onSort(col) {
  sortAsc.value = sortCol.value === col ? !sortAsc.value : true
  sortCol.value = col; page.value = 1; loadParquet()
}

function onPageSizeChange() { page.value = 1; loadParquet() }
function goToPage(p) { page.value = p; loadParquet() }

let _rowSeq = 0
function openRow(row) {
  props.winManager?.open({
    id: `row-detail:${props.file.path}:${_rowSeq++}`,
    title: props.file.name,
    icon: 'mdi-code-json',
    component: markRaw(services.get('text.json-viewer')),
    width: 520,
    height: 480,
    props: { value: row },
  })
}

const pageImagePool = computed(() => {
  const seen = new Set()
  const pool = []
  for (const row of rows.value) {
    for (const col of Object.keys(imageCols.value)) {
      const v = row[col]
      if (v && !seen.has(v)) { seen.add(v); pool.push({ path: v, name: v }) }
    }
  }
  return pool
})

function cellThumbUrl(value) { return value ? imagesApi.thumbnailUrl(value, 400) : '' }
function openImgPreview(value) {
  if (value) appRegistry?.open({ path: value, name: value }, { app: 'image', imagePool: pageImagePool.value })
}
</script>

<template>
  <div class="df-app">
    <!-- Header bar -->
    <div class="d-flex align-center px-3 py-2 flex-shrink-0" style="gap:8px; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
      <v-chip size="small" variant="tonal">{{ fileType.toUpperCase() }}</v-chip>
      <v-chip size="small">{{ t('dataframe.rows', { n: total.toLocaleString() }) }}</v-chip>
    </div>

    <!-- SQL editor bar -->
    <div class="pa-2 d-flex align-center ga-2 flex-shrink-0">
      <div ref="sqlEditorRef" class="sql-editor-wrap" />
      <v-btn size="small" color="primary" @click="applyFilter">{{ t('dataframe.filter') }}</v-btn>
      <v-btn size="small" variant="tonal" @click="clearFilter">{{ t('dataframe.clear') }}</v-btn>
      <v-spacer />
      <v-select
        v-if="hasImageCols"
        v-model="imgRowHeight"
        :items="[40, 64, 96, 128, 200]"
        :menu-props="{ zIndex: menuZ }"
        :label="t('dataframe.imgHeight')"
        density="compact" hide-details variant="outlined" style="max-width:110px"
      />
      <v-select
        v-model="pageSize"
        :items="[50, 100, 250, 500]"
        :menu-props="{ zIndex: menuZ }"
        :label="t('dataframe.rowsPerPage')"
        density="compact" hide-details variant="outlined" style="max-width:110px"
        @update:model-value="onPageSizeChange"
      />
    </div>

    <!-- Schema chips -->
    <div v-if="schema.length" class="px-3 pb-2 d-flex flex-wrap ga-1 flex-shrink-0" style="max-height:72px; overflow-y:auto">
      <v-chip
        v-for="col in schema" :key="col.name"
        size="x-small" variant="tonal"
        :color="sortCol === col.name ? 'primary' : undefined"
        style="cursor:pointer"
        @click="onSort(col.name)"
      >
        {{ col.name }}
        <span class="text-medium-emphasis ml-1">{{ shortDtype(col.dtype) }}</span>
        <v-icon v-if="sortCol === col.name" size="12" class="ml-1">{{ sortAsc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}</v-icon>
        <v-tooltip activator="parent" location="top">{{ col.dtype }}</v-tooltip>
      </v-chip>
    </div>

    <v-divider />

    <!-- Table -->
    <div class="table-area">
      <div class="table-scroll">
        <v-alert v-if="error" type="error" class="ma-4">{{ error }}</v-alert>
        <table v-else-if="rows.length" class="df-table">
          <thead>
            <tr>
              <th v-for="(col, i) in columns" :key="col" :class="{ sorted: sortCol === col }" @click="onSort(col)">
                {{ col }}
                <span class="dtype">{{ dtypes[i] }}</span>
                <v-icon v-if="sortCol === col" size="13" class="ml-1">{{ sortAsc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}</v-icon>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in rows" :key="ri" class="data-row" @dblclick="openRow(row)">
              <td v-for="col in columns" :key="col" :class="{ 'img-col': !!imageCols[col] }">
                <template v-if="imageCols[col] && row[col]">
                  <v-tooltip :text="row[col]" location="top">
                    <template #activator="{ props: tp }">
                      <img v-bind="tp" :src="cellThumbUrl(row[col])"
                        :style="{ height: imgRowHeight + 'px', cursor: 'pointer', borderRadius: '3px', verticalAlign: 'middle' }"
                        @click.stop="openImgPreview(row[col])" />
                    </template>
                  </v-tooltip>
                </template>
                <template v-else>{{ displayValue(row[col]) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="!loading" class="text-center text-medium-emphasis pa-12">{{ t('dataframe.noData') }}</div>
      </div>
      <div v-if="loading" class="loading-overlay">
        <v-progress-circular indeterminate />
      </div>
    </div>

    <!-- Pagination -->
    <v-divider />
    <div class="d-flex justify-center pa-2 flex-shrink-0">
      <PaginationBar :model-value="page" :total="totalPages" :disabled="loading" variant="tonal" @navigate="goToPage" />
    </div>
  </div>

</template>

<style scoped>
.df-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.table-area {
  flex: 1;
  min-height: 0;
  position: relative;
}
.table-scroll {
  height: 100%;
  overflow: auto;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.loading-overlay :deep(.v-progress-circular) {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));
}
.sql-editor-wrap {
  flex: 1;
  max-width: 700px;
  min-height: 36px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  cursor: text;
  transition: border-color 0.15s;
}
.sql-editor-wrap:focus-within {
  border-color: rgb(var(--v-theme-primary));
  border-width: 2px;
}
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
.df-table td.img-col { max-width: none; overflow: visible; text-overflow: unset; padding: 2px 8px; }
.df-table tr:hover td { background: rgba(var(--v-theme-on-surface), 0.04); }
.data-row { cursor: pointer; }
</style>
