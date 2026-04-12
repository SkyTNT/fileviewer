<script setup>
import { ref, computed, nextTick, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { sql, StandardSQL } from '@codemirror/lang-sql'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete'
import { dataframeApi, imagesApi } from '../../services/api.js'
import JsonNode from './JsonNode.vue'
import PaginationBar from '../PaginationBar.vue'

const emit = defineEmits(['open-image'])
const { t } = useI18n()

const dialog   = ref(false)
const fileName = ref('')
const filePath = ref('')
const fileType = ref('parquet')

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

const imageCols = ref({})
const filterSql = ref('')
const schemaTree = ref([])
const imgRowHeight = ref(48)

const hasImageCols = computed(() => Object.keys(imageCols.value).length > 0)

// ── CodeMirror SQL editor ─────────────────────────────────────────────────────

const sqlEditorRef = ref(null)
const schemaCompartment = new Compartment()
let editorView = null
let pendingColumns = null

function buildSqlExt(columnNames) {
  return sql({
    dialect: StandardSQL,
    schema: { df: columnNames },
    defaultTable: 'df',
    upperCaseKeywords: true,
  })
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
          {
            key: 'Enter',
            run: (view) => {
              if (acceptCompletion(view)) return true
              applyFilter()
              return true
            },
          },
          {
            key: 'Shift-Enter',
            run: (view) => {
              view.dispatch(view.state.replaceSelection('\n'))
              return true
            },
          },
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        placeholder('SELECT * FROM df WHERE age > 30  — or just:  age > 30'),
        EditorView.lineWrapping,
        EditorView.theme({
          // All colors use Vuetify CSS vars so they adapt to light/dark theme.
          // EditorView.theme() injects a <style> into <head> where the vars
          // resolve correctly via the cascade from .v-application.
          '&': {
            backgroundColor: 'rgb(var(--v-theme-surface))',
            color: 'rgb(var(--v-theme-on-surface))',
            borderRadius: '3px',
            maxHeight: '120px',
          },
          '.cm-scroller': {
            fontFamily: "'Roboto Mono', 'Courier New', monospace",
            fontSize: '13px',
            lineHeight: '1.6',
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '6px 10px',
            minHeight: '26px',
            caretColor: 'rgb(var(--v-theme-primary))',
          },
          '.cm-line': { padding: '0' },
          '.cm-focused': { outline: 'none' },
          '.cm-placeholder': {
            color: 'rgba(var(--v-theme-on-surface), 0.35)',
            fontStyle: 'italic',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'rgba(var(--v-theme-primary), 0.2) !important',
          },
          '&.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(var(--v-theme-primary), 0.3) !important',
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: 'rgb(var(--v-theme-primary))',
          },
          // Completion tooltip — inherits Vuetify vars since it's inside .v-application
          '.cm-tooltip': {
            backgroundColor: 'rgb(var(--v-theme-surface))',
            color: 'rgb(var(--v-theme-on-surface))',
            border: '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
            borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          },
          '.cm-tooltip.cm-tooltip-autocomplete > ul': {
            fontFamily: "'Roboto Mono', 'Courier New', monospace",
            fontSize: '13px',
          },
          '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
            padding: '4px 10px',
          },
          '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
            backgroundColor: 'rgba(var(--v-theme-primary), 0.2)',
            color: 'rgb(var(--v-theme-on-surface))',
          },
        }),
      ],
    }),
    parent: container,
  })
  if (pendingColumns !== null) {
    updateEditorSchema(pendingColumns)
  }
}

function updateEditorSchema(columnNames) {
  if (!editorView) {
    pendingColumns = columnNames
    return
  }
  pendingColumns = null
  editorView.dispatch({
    effects: schemaCompartment.reconfigure(buildSqlExt(columnNames)),
  })
}

watch(dialog, async (newVal) => {
  if (!newVal) return
  await nextTick()
  const container = sqlEditorRef.value
  if (!container) return
  // Vuetify unmounts dialog content on close, so the container is a fresh empty
  // element each time the dialog reopens. Recreate the editor whenever it's gone.
  if (!container.querySelector('.cm-editor')) {
    editorView?.destroy()
    editorView = null
    createEditor(container)
  }
})

onUnmounted(() => {
  editorView?.destroy()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── open ──────────────────────────────────────────────────────────────────────

async function open(file, type = 'parquet') {
  fileType.value   = type
  filePath.value   = file.path
  fileName.value   = file.name
  page.value       = 1
  sortCol.value    = null
  sortAsc.value    = true
  filterSql.value  = ''
  columns.value    = []
  rows.value       = []
  schema.value     = []
  schemaTree.value = []
  imageCols.value  = {}
  error.value      = null
  loading.value    = true
  dialog.value     = true

  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: '' },
    })
  }

  await loadSchema()
  await loadParquet()
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadSchema() {
  try {
    const res = await dataframeApi.getSchema(filePath.value)
    schema.value     = res.data.columns.map((c, i) => ({ name: c, dtype: res.data.dtypes[i] }))
    schemaTree.value = res.data.schema_tree ?? []
    updateEditorSchema(res.data.columns)
  } catch {}
  dataframeApi.detectImageCols(filePath.value)
    .then(res => {
      imageCols.value = Object.fromEntries(res.data.image_cols.map(({ col, kind }) => [col, kind]))
    })
    .catch(() => {})
}

async function loadParquet() {
  loading.value = true
  error.value   = null
  try {
    const res = await dataframeApi.getData(filePath.value, {
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

// ── Controls ──────────────────────────────────────────────────────────────────

function applyFilter() {
  filterSql.value = editorView ? editorView.state.doc.toString().trim() : ''
  page.value = 1
  loadParquet()
}

function clearFilter() {
  filterSql.value = ''
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: '' },
    })
  }
  page.value = 1
  loadParquet()
}

function onSort(col) {
  sortAsc.value = sortCol.value === col ? !sortAsc.value : true
  sortCol.value = col
  page.value    = 1
  loadParquet()
}

function onPageSizeChange() {
  page.value = 1
  loadParquet()
}
function goToPage(p) {
  page.value = p
  loadParquet()
}

// ── Row detail ────────────────────────────────────────────────────────────────

const rowDialog   = ref(false)
const selectedRow = ref(null)

function openRow(row) {
  selectedRow.value = row
  rowDialog.value   = true
}

// ── Image helpers ─────────────────────────────────────────────────────────────

function cellThumbUrl(value) {
  return value ? imagesApi.thumbnailUrl(value, 400) : ''
}
function openImgPreview(value) {
  if (value) emit('open-image', { path: value, name: value })
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
        <v-chip size="small" class="mr-2">{{ t('dataframe.rows', { n: total.toLocaleString() }) }}</v-chip>
        <v-btn icon size="small" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-divider />

      <!-- SQL editor bar -->
      <div class="pa-2 d-flex align-center ga-2">
        <div ref="sqlEditorRef" class="sql-editor-wrap" />
        <v-btn size="small" color="primary" @click="applyFilter">{{ t('dataframe.filter') }}</v-btn>
        <v-btn size="small" variant="tonal" @click="clearFilter">{{ t('dataframe.clear') }}</v-btn>
        <v-spacer />
        <v-select
          v-if="hasImageCols"
          v-model="imgRowHeight"
          :items="[40, 64, 96, 128, 200]"
          :label="t('dataframe.imgHeight')"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width:110px"
        />
        <v-select
          v-model="pageSize"
          :items="[50, 100, 250, 500]"
          :label="t('dataframe.rowsPerPage')"
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
      <div class="table-area">
      <v-card-text class="pa-0" style="overflow:auto; max-height:58vh">
        <v-alert v-if="error" type="error" class="ma-4">{{ error }}</v-alert>
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
              <td v-for="col in columns" :key="col" :class="{ 'img-col': !!imageCols[col] }">
                <template v-if="imageCols[col] && row[col]">
                  <v-tooltip :text="row[col]" location="top">
                    <template #activator="{ props: tp }">
                      <img
                        v-bind="tp"
                        :src="cellThumbUrl(row[col])"
                        :style="{ height: imgRowHeight + 'px', cursor: 'pointer', borderRadius: '3px', verticalAlign: 'middle' }"
                        @click.stop="openImgPreview(row[col])"
                      />
                    </template>
                  </v-tooltip>
                </template>
                <template v-else>{{ displayValue(row[col]) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="!loading" class="text-center text-medium-emphasis pa-12">{{ t('dataframe.noData') }}</div>
      </v-card-text>
      <div v-if="loading" class="loading-overlay">
        <v-progress-circular indeterminate />
      </div>
      </div>

      <!-- Pagination -->
      <v-divider />
      <v-card-actions class="justify-center">
        <PaginationBar
          :model-value="page"
          :total="totalPages"
          :disabled="loading"
          variant="tonal"
          @navigate="goToPage"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Row detail dialog -->
  <v-dialog v-model="rowDialog" max-width="600" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-code-json</v-icon>
        {{ t('dataframe.rowDetail') }}
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
.table-area { position: relative; }
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
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
  /* overflow: visible so the autocomplete tooltip can extend outside the border */
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
.df-table td.img-col {
  max-width: none;
  overflow: visible;
  text-overflow: unset;
  padding: 2px 8px;
}
.df-table tr:hover td { background: rgba(var(--v-theme-on-surface), 0.04); }
.data-row { cursor: pointer; }
.tree-bg {
  background: rgb(var(--v-theme-surface));
  border-radius: 6px;
  font-family: 'Roboto Mono', monospace;
}
</style>

