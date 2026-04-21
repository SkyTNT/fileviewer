<script setup>
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import ArchiveTreeNode from './ArchiveTreeNode.vue'
const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t }    = useI18n()
const services = inject('services')
const store              = services?.get('explorer.state')
const JsonNode           = services?.get('text.json-node')
const archiveApi         = services?.get('archive.api')
const writeApi           = services?.get('write.api')
const ft                 = services?.get('file.types')
const openConflictDialog = services?.get('fs-ops.conflict-dialog')

// ── state ─────────────────────────────────────────────────────────────────────
const loading      = ref(false)
const scanning     = ref(false)
const error        = ref(null)
const archiveInfo  = ref(null)
const treeItems    = ref([])

// Non-reactive scan accumulators (updated during SSE stream)
let _allEntriesAcc = []
let _totalUncomp   = 0
let _totalComp     = 0
let _rebuildTimer  = null
let _scanAbort     = null

// ── password ─────────────────────────────────────────────────────────────────
const passwordRequired = ref(false)
const passwordError    = ref(false)
const password         = ref('')
const showPwd          = ref(false)

const showPasswordBar = computed(() =>
  passwordRequired.value || (archiveInfo.value?.encrypted && !password.value)
)

// ── mobile layout ─────────────────────────────────────────────────────────────
const windowWidth      = ref(window.innerWidth)
const mobileShowApp = ref(false)
const isMobile = computed(() => windowWidth.value < 640)
function onResize() { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
function backToTree() { mobileShowApp.value = false }

// ── tree panel resize ─────────────────────────────────────────────────────────
const MIN_TREE  = 160
const MAX_TREE  = 600
const treeWidth = ref(parseInt(localStorage.getItem('fv-archive-tree-width') || '260'))
const treeResizing = ref(false)

function startTreeResize(e) {
  e.preventDefault()
  treeResizing.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  const startX = e.clientX
  const startW = treeWidth.value
  function onMove(e) {
    treeWidth.value = Math.min(MAX_TREE, Math.max(MIN_TREE, startW + e.clientX - startX))
  }
  function onUp() {
    treeResizing.value = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    localStorage.setItem('fv-archive-tree-width', treeWidth.value)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── selection (partial extract) ──────────────────────────────────────────────
const checkedPaths = ref(new Set())

const extractEntries = computed(() =>
  checkedPaths.value.size > 0 ? [...checkedPaths.value] : null
)

function getAllPaths(node) {
  const out = [node.path]
  if (node.children) for (const c of node.children) out.push(...getAllPaths(c))
  return out
}

function onToggle(item) {
  const s = new Set(checkedPaths.value)
  if (s.has(item.path)) {
    for (const p of getAllPaths(item)) s.delete(p)
  } else {
    if (item.is_dir) for (const p of getAllPaths(item)) s.delete(p)
    s.add(item.path)
  }
  checkedPaths.value = s
}

// ── selected entry inline viewer ──────────────────────────────────────────────
const selectedEntry  = ref(null)
const entryLoading   = ref(false)
const entryText      = ref(null)
const entryJson      = ref(null)
const entryImgUrl    = ref(null)
const entryError     = ref(null)

// ── extract progress ──────────────────────────────────────────────────────────
const extracting      = ref(false)
const extractDone     = ref(0)
const extractTotal    = ref(0)
const extractErrors   = ref([])
const extractFinished = ref(false)

// ── totals (set once on done event) ──────────────────────────────────────────
const totalUncompressed = ref(0)
const totalCompressed   = ref(0)

// ── file type helpers ─────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','tiff','tif'])
const TEXT_EXTS  = new Set([
  'txt','md','rst','log','ini','cfg','conf','env','yaml','yml','toml',
  'xml','html','htm','css','js','mjs','ts','tsx','jsx','vue','svelte',
  'py','sh','bash','zsh','rb','php','pl','lua','go','rs','swift','kt',
  'java','c','h','cpp','hpp','cs','sql','r','dart','ex','exs',
])
const JSON_EXTS = new Set(['json','jsonl','ndjson'])

function entryExt(name) { return (name.split('.').pop() || '').toLowerCase() }
function isImage(e)  { return IMAGE_EXTS.has(entryExt(e.name)) }
function isText(e)   { return TEXT_EXTS.has(entryExt(e.name)) }
function isJson(e)   { return JSON_EXTS.has(entryExt(e.name)) }

// ── build tree ────────────────────────────────────────────────────────────────
function buildTree(entries) {
  const map = {}
  const roots = []

  function ensureDir(normPath) {
    if (map[normPath]) return map[normPath]
    const parts = normPath.split('/')
    const name  = parts[parts.length - 1]
    const node  = { name, path: normPath + '/', is_dir: true, size: 0,
                    compressed_size: 0, modified: null, children: [] }
    map[normPath] = node
    if (parts.length === 1) roots.push(node)
    else ensureDir(parts.slice(0, -1).join('/')).children.push(node)
    return node
  }

  const sorted = [...entries].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))
  for (const entry of sorted) {
    const normPath = entry.path.replace(/\/$/, '')
    if (map[normPath]) { Object.assign(map[normPath], entry, { children: map[normPath].children }); continue }
    const parts = normPath.split('/')
    const node  = { ...entry, children: entry.is_dir ? [] : null }
    map[normPath] = node
    if (parts.length === 1) roots.push(node)
    else ensureDir(parts.slice(0, -1).join('/')).children.push(node)
  }
  return roots
}

// ── open ──────────────────────────────────────────────────────────────────────
watch(() => props.file, async (f) => {
  if (!f) return
  password.value         = ''
  selectedEntry.value    = null
  mobileShowApp.value = false
  checkedPaths.value     = new Set()
  extracting.value       = false
  extractFinished.value  = false
  await loadArchive()
}, { immediate: true })

function _cancelScan() {
  if (_scanAbort)    { _scanAbort.abort(); _scanAbort = null }
  if (_rebuildTimer) { clearTimeout(_rebuildTimer); _rebuildTimer = null }
}

function _scheduleRebuild() {
  if (_rebuildTimer) return
  _rebuildTimer = setTimeout(() => {
    _rebuildTimer = null
    treeItems.value = buildTree(_allEntriesAcc)
  }, 800)
}

async function loadArchive() {
  _cancelScan()

  archiveInfo.value      = null
  treeItems.value        = []
  error.value            = null
  passwordRequired.value = false
  passwordError.value    = false
  scanning.value         = false
  totalUncompressed.value = 0
  totalCompressed.value   = 0
  _allEntriesAcc = []
  _totalUncomp   = 0
  _totalComp     = 0

  loading.value = true
  _scanAbort = new AbortController()

  try {
    const res = await archiveApi.getInfo(props.file.path, password.value || null, _scanAbort.signal)
    loading.value = false

    if (!res.ok) {
      if (res.status === 422) {
        passwordRequired.value = true
        if (password.value) passwordError.value = true
      } else {
        error.value = `HTTP ${res.status}`
      }
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()

      let hasNew = false
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        let data
        try { data = JSON.parse(line.slice(5).trim()) } catch { continue }

        if (data.type === 'meta') {
          archiveInfo.value = { format: data.format, random_access: data.random_access, encrypted: data.encrypted, entry_count: 0 }
          scanning.value = true
        } else if (data.type === 'entry') {
          _allEntriesAcc.push(data)
          if (!data.is_dir) { _totalUncomp += data.size || 0; _totalComp += data.compressed_size || 0 }
          if (archiveInfo.value) archiveInfo.value.entry_count++
          hasNew = true
        } else if (data.type === 'done') {
          _cancelScan()
          if (archiveInfo.value) archiveInfo.value.entry_count = data.entry_count
          scanning.value = false
          treeItems.value = buildTree(_allEntriesAcc)
          totalUncompressed.value = _totalUncomp
          totalCompressed.value   = _totalComp
        } else if (data.type === 'error') {
          _cancelScan()
          if (data.code === 'password_required') {
            passwordRequired.value = true
            if (password.value) passwordError.value = true
          } else {
            error.value = data.message
          }
          scanning.value = false
          return
        }
      }

      if (hasNew) _scheduleRebuild()
    }
  } catch (e) {
    if (e.name !== 'AbortError') error.value = e.message
  } finally {
    loading.value = false
    scanning.value = false
  }
}

async function unlock() {
  if (!password.value) return
  const prev = selectedEntry.value
  await loadArchive()
  if (prev && !passwordRequired.value) await selectEntry(prev)
}

// ── inline entry viewer ───────────────────────────────────────────────────────
async function selectEntry(entry) {
  if (!entry || entry.is_dir) return
  selectedEntry.value = entry
  entryText.value     = null
  entryJson.value     = null
  entryImgUrl.value   = null
  entryError.value    = null

  if (isMobile.value && archiveInfo.value?.random_access) mobileShowApp.value = true
  if (!archiveInfo.value?.random_access) return

  if (isImage(entry)) {
    entryImgUrl.value = archiveApi.entryUrl(props.file.path, entry.path, password.value || null)
    return
  }

  if (isText(entry) || isJson(entry)) {
    entryLoading.value = true
    try {
      const text = await archiveApi.getEntryText(props.file.path, entry.path, password.value || null)
      if (isJson(entry)) {
        try { entryJson.value = JSON.parse(text) } catch { entryText.value = text }
      } else {
        entryText.value = text
      }
    } catch (e) {
      if (e.response?.status === 422) {
        passwordRequired.value = true
        passwordError.value = !!password.value
        entryError.value = t('archive.app.passwordRequired')
      } else {
        entryError.value = e.message
      }
    } finally {
      entryLoading.value = false
    }
  }
}

function onImgError() {
  entryImgUrl.value = null
  if (archiveInfo.value?.encrypted) {
    passwordRequired.value = true
    passwordError.value = !!password.value
    entryError.value = t('archive.app.passwordRequired')
  }
}

// ── extract ───────────────────────────────────────────────────────────────────
async function extractHere() { await doExtract(store.currentPath) }

async function extractToSubfolder() {
  if (!props.file) return
  const name = props.file.name
  let folder = name
  for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz']) {
    if (name.toLowerCase().endsWith(ext)) { folder = name.slice(0, -ext.length); break }
  }
  if (folder === name) { const dot = name.lastIndexOf('.'); if (dot > 0) folder = name.slice(0, dot) }
  try { await writeApi.mkdir(store.currentPath, folder) } catch { /* already exists */ }
  await doExtract(store.currentPath + '/' + folder)
}

async function doExtract(dest) {
  extracting.value      = true
  extractDone.value     = 0
  extractTotal.value    = 0
  extractErrors.value   = []
  extractFinished.value = false

  // Check for conflicts before starting
  const entries = extractEntries.value
  let strategy = 'overwrite'
  try {
    const res = await archiveApi.checkConflicts(props.file.path, dest, password.value || null, entries)
    if (res.data.conflicts.length > 0) {
      strategy = await openConflictDialog(res.data.conflicts)
      if (!strategy) { extracting.value = false; return }
    }
  } catch { /* ignore, proceed with overwrite */ }

  try {
    const res     = await archiveApi.extract(props.file.path, dest, password.value || null, entries, strategy)
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'progress')      { extractDone.value = data.done; extractTotal.value = data.total }
          else if (data.type === 'error')    { extractErrors.value.push(data.message || data.name || 'Error') }
          else if (data.type === 'done')     { extractFinished.value = true; store.refresh(); store.invalidateTree?.() }
        } catch { /* bad SSE */ }
      }
    }
  } catch (e) {
    extractErrors.value.push(e.message)
    extractFinished.value = true
  }
}

const extractPercent = computed(() =>
  extractTotal.value > 0 ? Math.round((extractDone.value / extractTotal.value) * 100) : 0
)

function closeExtract() {
  extracting.value      = false
  extractFinished.value = false
  extractErrors.value   = []
}

// Cancel in-progress scan when component is unmounted
onUnmounted(() => _cancelScan())
</script>

<template>
  <div class="archive-root">

    <!-- ── toolbar ──────────────────────────────────────────────────────── -->
    <v-toolbar density="compact" color="surface-variant">
      <!-- mobile: back button when viewer is open -->
      <v-btn v-if="isMobile && mobileShowApp" icon size="small" @click="backToTree">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-icon v-else class="ml-3 mr-2" size="20">mdi-archive-outline</v-icon>

      <v-toolbar-title class="text-body-2 text-truncate">
        {{ props.file?.name }}
        <template v-if="archiveInfo && !isMobile">
          <v-chip size="x-small" class="ml-1" variant="tonal" label>
            {{ archiveInfo.format.toUpperCase() }}
          </v-chip>
          <v-chip
            size="x-small" class="ml-1" variant="tonal" label
            :color="archiveInfo.random_access ? 'success' : 'warning'"
          >
            {{ archiveInfo.random_access ? t('archive.app.randomAccess') : t('archive.app.sequentialAccess') }}
          </v-chip>
        </template>
      </v-toolbar-title>

      <v-spacer />

      <template v-if="archiveInfo && !extracting && store.writeMode && !store.isAtHome">
        <v-btn icon size="small" :title="t('archive.app.extractHere')" @click="extractHere">
          <v-icon size="18">mdi-archive-arrow-down-outline</v-icon>
        </v-btn>
        <v-btn icon size="small" class="mr-1" :title="t('archive.app.extractToSubfolder')" @click="extractToSubfolder">
          <v-icon size="18">mdi-folder-arrow-down-outline</v-icon>
        </v-btn>
      </template>
    </v-toolbar>

      <!-- ── password bar ───────────────────────────────────────────────────── -->
      <div v-if="showPasswordBar" class="pwd-bar">
        <v-icon
          size="16" class="flex-shrink-0"
          :color="passwordError ? 'error' : 'on-surface-variant'"
        >mdi-lock-outline</v-icon>
        <v-text-field
          v-model="password"
          :type="showPwd ? 'text' : 'password'"
          :placeholder="t('archive.app.passwordPrompt')"
          :error="passwordError"
          autocomplete="off"
          density="compact"
          variant="outlined"
          hide-details
          class="pwd-input"
          :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
          @click:append-inner="showPwd = !showPwd"
          @keydown.enter="unlock"
        />
        <v-btn
          icon size="small" variant="text" class="flex-shrink-0"
          :loading="loading"
          @click="unlock"
        >
          <v-icon size="18">mdi-chevron-right</v-icon>
        </v-btn>
      </div>

      <!-- ── loading / error ────────────────────────────────────────────────── -->
      <v-progress-linear v-if="loading || scanning" indeterminate color="primary" height="2" />
      <div v-if="error && !loading" class="pa-3">
        <v-alert type="error" density="compact" :text="error" />
      </div>

      <!-- ── main content ───────────────────────────────────────────────────── -->
      <div v-if="archiveInfo && !error" class="archive-body">

        <!-- Tree panel -->
        <div
          class="archive-tree"
          :class="{ 'd-none': isMobile && mobileShowApp }"
          :style="isMobile ? {} : { width: treeWidth + 'px' }"
        >
          <div class="archive-tree-header px-3 d-flex align-center">
            <span class="text-caption text-medium-emphasis d-flex align-center ga-1">
              {{ t('archive.app.entries', { n: archiveInfo.entry_count }) }}
              <v-progress-circular v-if="scanning" size="10" width="1.5" indeterminate color="medium-emphasis" />
            </span>
            <v-spacer />
            <v-chip
              v-if="checkedPaths.size > 0"
              size="x-small" color="primary" variant="tonal" label
              class="mr-1" style="cursor:pointer"
              @click="checkedPaths = new Set()"
            >
              {{ checkedPaths.size }} <v-icon size="12" end>mdi-close</v-icon>
            </v-chip>
            <template v-if="isMobile && archiveInfo">
              <v-chip size="x-small" variant="tonal" label class="mr-1">{{ archiveInfo.format.toUpperCase() }}</v-chip>
            </template>
          </div>
          <v-divider />
          <div class="archive-tree-scroll">
            <div class="archive-tree-inner">
              <ArchiveTreeNode
                v-for="item in treeItems"
                :key="item.path"
                :item="item"
                :random-access="archiveInfo.random_access"
                :selected-path="selectedEntry?.path"
                :depth="0"
                :checked-paths="checkedPaths"
                @select="selectEntry"
                @toggle="onToggle"
              />
            </div>
          </div>
          <v-divider />
          <!-- Drag resize handle -->
          <div
            v-if="!isMobile"
            class="archive-tree-resizer"
            :class="{ active: treeResizing }"
            @mousedown="startTreeResize"
          />
          <!-- Footer: totals or sequential notice -->
          <div class="px-3 py-2 text-caption text-medium-emphasis d-flex align-center ga-1">
            <template v-if="!archiveInfo.random_access">
              <v-icon size="13">mdi-information-outline</v-icon>
              {{ t('archive.app.noRandomAccess') }}
            </template>
            <template v-else>
              {{ ft.formatBytes(totalUncompressed) }}
              <template v-if="totalCompressed > 0 && totalCompressed !== totalUncompressed">
                → {{ ft.formatBytes(totalCompressed) }}
                ({{ Math.round((1 - totalCompressed / totalUncompressed) * 100) }}% saved)
              </template>
            </template>
          </div>
        </div>

        <!-- Viewer panel — only for random-access formats -->
        <div
          v-if="archiveInfo.random_access"
          class="archive-app-panel"
          :class="{ 'd-none': isMobile && !mobileShowApp }"
        >
          <!-- Nothing selected -->
          <div v-if="!selectedEntry" class="archive-app-placeholder">
            <v-icon size="36" class="text-disabled">mdi-file-search-outline</v-icon>
            <span class="text-caption text-disabled mt-1">{{ t('archive.app.clickToView') }}</span>
          </div>

          <template v-else>
            <!-- Entry header bar -->
            <div class="d-flex align-center px-3 py-1 ga-2" style="min-height:36px; flex-shrink:0">
              <v-icon size="14" class="flex-shrink-0">mdi-file-outline</v-icon>
              <span class="text-body-2 text-truncate flex-1-1-0" :title="selectedEntry.path">
                {{ selectedEntry.name }}
              </span>
              <span class="text-caption text-disabled flex-shrink-0">{{ ft.formatBytes(selectedEntry.size) }}</span>
              <v-btn
                icon size="x-small" variant="text" class="flex-shrink-0"
                :href="archiveApi.entryUrl(props.file.path, selectedEntry.path, password || null)"
                download
              >
                <v-icon size="14">mdi-download</v-icon>
              </v-btn>
            </div>
            <v-divider />

            <div class="archive-entry-content">
              <div v-if="entryLoading" class="d-flex justify-center pa-8">
                <v-progress-circular indeterminate color="primary" size="28" />
              </div>
              <div v-else-if="entryError" class="pa-3">
                <v-alert type="error" density="compact" :text="entryError" />
              </div>
              <div v-else-if="entryImgUrl" class="archive-entry-img-wrap">
                <img
                  :src="entryImgUrl"
                  class="archive-entry-img"
                  :alt="selectedEntry.name"
                  @error="onImgError"
                />
              </div>
              <div v-else-if="entryJson !== null" class="pa-3 archive-entry-json">
                <JsonNode :value="entryJson" :depth="0" />
              </div>
              <div v-else-if="entryText !== null" class="archive-entry-text-wrap">
                <pre class="archive-entry-text">{{ entryText }}</pre>
              </div>
              <!-- Unsupported type / download fallback -->
              <div v-else class="d-flex flex-column align-center justify-center ga-2 pa-6">
                <v-icon size="40" class="text-disabled">mdi-file-outline</v-icon>
                <span class="text-caption text-disabled">{{ selectedEntry.name }}</span>
                <v-btn
                  color="primary" variant="tonal" size="small"
                  prepend-icon="mdi-download"
                  :href="archiveApi.entryUrl(props.file.path, selectedEntry.path, password || null)"
                  download
                >{{ t('archive.app.download') }}</v-btn>
              </div>
            </div>
          </template>
        </div>

      </div>

      <!-- ── extract progress overlay ──────────────────────────────────────── -->
      <div v-if="extracting" class="extract-overlay pa-4">
        <v-card class="extract-card pa-4" max-width="480">
          <div class="d-flex align-center mb-3">
            <v-icon class="mr-2" color="primary">mdi-archive-arrow-down-outline</v-icon>
            <span class="text-subtitle-1 font-weight-medium">{{ t('archive.app.extracting') }}</span>
          </div>
          <v-progress-linear
            :model-value="extractPercent"
            :indeterminate="extractTotal === 0"
            color="primary" height="8" rounded class="mb-2"
          />
          <div class="text-caption text-medium-emphasis mb-3">{{ extractDone }} / {{ extractTotal || '…' }}</div>
          <div v-if="extractErrors.length" class="mb-3">
            <div v-for="(err, i) in extractErrors.slice(0, 5)" :key="i" class="text-caption text-error">{{ err }}</div>
          </div>
          <v-btn v-if="extractFinished" color="primary" variant="tonal" block @click="closeExtract">
            {{ t('archive.app.close') }}
          </v-btn>
        </v-card>
      </div>
  </div>
</template>

<style scoped>
.archive-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ── Password bar ─────────────────────────────────────────────────────────── */
.pwd-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 14px;
  background: rgba(var(--v-theme-surface-variant), 0.35);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}
.pwd-input {
  flex: 1;
  min-width: 0;
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
.archive-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.archive-tree {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
}
.archive-tree-header {
  flex-shrink: 0;
  min-height: 32px;
}
.archive-tree-scroll {
  flex: 1;
  overflow: auto;
  padding: 4px;
}
.archive-tree-inner {
  width: max-content;
  min-width: 100%;
}
.archive-tree-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  transition: background 0.15s;
}
.archive-tree-resizer:hover,
.archive-tree-resizer.active {
  background: rgba(var(--v-theme-primary), 0.4);
}
.archive-app-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.archive-app-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* ── Entry content ────────────────────────────────────────────────────────── */
.archive-entry-content {
  flex: 1;
  overflow: auto;
}
.archive-entry-img-wrap {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  height: 100%;
  box-sizing: border-box;
}
.archive-entry-img {
  max-width: 100%;
  display: block;
  border-radius: 4px;
}
.archive-entry-json { overflow-x: auto; }
.archive-entry-text-wrap { overflow: auto; height: 100%; }
.archive-entry-text {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  padding: 16px;
  margin: 0;
  tab-size: 4;
}

/* ── Extract overlay ──────────────────────────────────────────────────────── */
.extract-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(4px);
}
.extract-card { width: 100%; }

/* ── Mobile ───────────────────────────────────────────────────────────────── */
@media (max-width: 639px) {
  .archive-tree {
    width: 100% !important;
    border-right: none !important;
  }
  .archive-app-panel {
    width: 100%;
  }
}
</style>
