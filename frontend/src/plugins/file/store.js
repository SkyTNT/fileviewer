import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { filesApi, configApi, writeApi } from '@/services/api.js'
import { useTaskStore } from '@/plugins/task/store.js'
import { readSSE } from '@/utils/sse.js'
import PasteTaskItem  from '@/plugins/write/PasteTaskItem.vue'
import DeleteTaskItem from '@/plugins/write/DeleteTaskItem.vue'

export const useFileStore = defineStore('file', () => {
  const rootName    = ref('Root')
  const currentPath    = ref('')
  const entries        = ref([])
  const displayEntries = ref([])
  const loading        = ref(false)
  const error       = ref(null)
  const viewMode    = ref('waterfall')
  const page        = ref(1)
  const pageSize    = ref(50)
  const total       = ref(0)
  const selectedEntries  = ref([])
  const selectionAnchor  = ref(null)
  const selectedEntry    = computed(() =>
    selectedEntries.value.length === 1 ? selectedEntries.value[0] : null
  )
  const writeMode     = ref(false)
  const roots         = ref([])
  const treeRevision  = ref(0)
  const filterPattern = ref('')
  const sortBy        = ref(localStorage.getItem('fv-sort-by')    || 'name')
  const sortOrder     = ref(localStorage.getItem('fv-sort-order') || 'asc')
  const clipboard     = ref(null)  // { entries: [...], action: 'copy' | 'cut' }
  const nameConflicts = ref(null)  // { conflicts: [{name}], resolve: fn } | null
  const contextMenuFile = ref(null) // file under the right-click cursor
  const isContextMenuTarget = computed(() =>
    contextMenuFile.value != null &&
    selectedEntries.value.some(e => e.path === contextMenuFile.value?.path)
  )
  function setContextMenuFile(f) { contextMenuFile.value = f }

  function invalidateTree() { treeRevision.value++ }

  // ── Refresh hook ──────────────────────────────────────────────────────────────
  let _refreshHook = null
  function setRefreshHook(fn) { _refreshHook = fn }
  function refresh() {
    if (_refreshHook) _refreshHook()
    else loadDirectory(currentPath.value)
  }

  function selectEntry(entry) {
    if (!entry) { selectedEntries.value = []; selectionAnchor.value = null; return }
    const isSame = selectedEntries.value.length === 1 && selectedEntries.value[0].path === entry.path
    selectedEntries.value = isSame ? [] : [entry]
    selectionAnchor.value = isSame ? null : entry
  }

  function toggleEntry(entry) {
    const idx = selectedEntries.value.findIndex(e => e.path === entry.path)
    if (idx >= 0) selectedEntries.value = selectedEntries.value.filter((_, i) => i !== idx)
    else        { selectedEntries.value = [...selectedEntries.value, entry]; selectionAnchor.value = entry }
  }

  function shiftSelectTo(entry, visibleEntries) {
    if (!selectionAnchor.value) { selectEntry(entry); return }
    const anchorIdx = visibleEntries.findIndex(e => e.path === selectionAnchor.value.path)
    const targetIdx = visibleEntries.findIndex(e => e.path === entry.path)
    if (anchorIdx === -1) { selectEntry(entry); return }
    const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
    selectedEntries.value = visibleEntries.slice(from, to + 1)
  }

  function addToSelection(newEntries) {
    const existing = new Set(selectedEntries.value.map(e => e.path))
    const toAdd = newEntries.filter(e => !existing.has(e.path))
    if (toAdd.length) selectedEntries.value = [...selectedEntries.value, ...toAdd]
  }

  function clearSelection()      { selectedEntries.value = []; selectionAnchor.value = null }
  function setSelection(entries) { selectedEntries.value = [...entries]; selectionAnchor.value = entries.at(-1) ?? null }

  function setCopy(entries) {
    clipboard.value = { entries: Array.isArray(entries) ? entries : [entries], action: 'copy' }
  }
  function setCut(entries) {
    clipboard.value = { entries: Array.isArray(entries) ? entries : [entries], action: 'cut' }
  }
  function clearClipboard() { clipboard.value = null }

async function deleteEntries(entries) {
    const taskStore = useTaskStore()
    const data = reactive({ done: 0, total: entries.length, current: '' })
    const task = taskStore.add({ component: DeleteTaskItem, data })
    try {
      const response = await writeApi.delete(entries.map(e => e.path))
      await readSSE(response, (ev) => {
        if (ev.type === 'progress' || ev.type === 'error') {
          data.done    = ev.done
          data.total   = ev.total
          data.current = ev.name || ''
        }
        if (ev.type === 'error')
          task.errors.push(ev.name ? `${ev.name}: ${ev.message}` : ev.message)
        if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          clearSelection()
          invalidateTree()
          refresh()
        }
      })
      if (task.status === 'running') {
        task.errors.push('Unexpected end of stream')
        task.status = 'error'
      }
    } catch (e) {
      task.errors.push(e.message)
      task.status = 'error'
    }
  }

  async function _executePaste(entries, action, destDir, onConflict) {
    const taskStore = useTaskStore()
    const apiAction = action === 'cut' ? 'move' : 'copy'
    const data = reactive({ action: apiAction, done: 0, total: entries.length, current: '', bytes_done: 0, bytes_total: 0 })
    const task = taskStore.add({ component: PasteTaskItem, data })
    try {
      const response = await writeApi.paste(entries, apiAction, destDir, onConflict)
      await readSSE(response, (ev) => {
        if (ev.type === 'progress' || ev.type === 'error') {
          data.done        = ev.done
          data.total       = ev.total
          data.current     = ev.name || ''
          data.bytes_done  = ev.bytes_done  ?? data.bytes_done
          data.bytes_total = ev.bytes_total ?? data.bytes_total
        }
        if (ev.type === 'error')
          task.errors.push(ev.name ? `${ev.name}: ${ev.message}` : ev.message)
        if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          if (action === 'cut') clipboard.value = null
          invalidateTree()
          refresh()
        }
      })
      if (task.status === 'running') {
        task.errors.push('Unexpected end of stream')
        task.status = 'error'
      }
    } catch (e) {
      task.errors.push(e.message)
      task.status = 'error'
    }
  }

  async function paste() {
    if (!clipboard.value) return
    const { entries, action } = clipboard.value
    const destDir = currentPath.value
    const res = await writeApi.checkConflicts(entries.map(e => ({ name: e.name, dest_parent: destDir })))
    if (res.data.conflicts.length > 0) {
      const strategy = await new Promise((resolve) => {
        nameConflicts.value = { conflicts: res.data.conflicts, resolve }
      })
      if (!strategy) return
      await _executePaste(entries, action, destDir, strategy)
      return
    }
    await _executePaste(entries, action, destDir, 'skip')
  }

  async function _executeLink(entries, destDir, onConflict) {
    const taskStore = useTaskStore()
    const data = reactive({ action: 'link', done: 0, total: entries.length, current: '', bytes_done: 0, bytes_total: 0 })
    const task = taskStore.add({ component: PasteTaskItem, data })
    try {
      const response = await writeApi.symlink(entries, destDir, onConflict)
      await readSSE(response, (ev) => {
        if (ev.type === 'progress' || ev.type === 'error') {
          data.done    = ev.done
          data.total   = ev.total
          data.current = ev.name || ''
        }
        if (ev.type === 'error')
          task.errors.push(ev.name ? `${ev.name}: ${ev.message}` : ev.message)
        if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          invalidateTree()
          refresh()
        }
      })
      if (task.status === 'running') {
        task.errors.push('Unexpected end of stream')
        task.status = 'error'
      }
    } catch (e) {
      task.errors.push(e.message)
      task.status = 'error'
    }
  }

  async function pasteAsLink() {
    if (!clipboard.value) return
    const { entries } = clipboard.value
    const destDir = currentPath.value
    const res = await writeApi.checkConflicts(entries.map(e => ({ name: e.name, dest_parent: destDir })))
    if (res.data.conflicts.length > 0) {
      const strategy = await new Promise((resolve) => {
        nameConflicts.value = { conflicts: res.data.conflicts, resolve }
      })
      if (!strategy) return
      await _executeLink(entries, destDir, strategy)
      return
    }
    await _executeLink(entries, destDir, 'skip')
  }

  function resolveNameConflicts(strategy) {
    nameConflicts.value?.resolve(strategy)
    nameConflicts.value = null
  }
  function cancelNameConflicts() { resolveNameConflicts(null) }

  function setFilter(pattern) {
    filterPattern.value = pattern
    loadDirectory(currentPath.value)
  }

  function setSort(by, order) {
    sortBy.value    = by
    sortOrder.value = order
    localStorage.setItem('fv-sort-by',    by)
    localStorage.setItem('fv-sort-order', order)
    invalidateTree()
    loadDirectory(currentPath.value)
  }

  const isAtHome = computed(() => currentPath.value === '')

  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean)
    const crumbs = [{ name: rootName.value, path: '' }]
    let cum = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      cum = cum ? cum + '/' + part : part
      let name = part
      if (i === 0) {
        const root = roots.value.find(r => r.slug === part)
        if (root) name = root.name
      }
      crumbs.push({ name, path: cum })
    }
    return crumbs
  })

  function getHashPath() {
    const hash = window.location.hash
    if (!hash || hash === '#' || hash === '#/') return ''
    return decodeURIComponent(hash.replace(/^#\/?/, ''))
  }

  function writeHash(path, push = false) {
    const hash = path ? `#/${encodeURIComponent(path)}` : '#/'
    if (window.location.hash === hash) return
    if (push) history.pushState(null, '', hash)
    else      history.replaceState(null, '', hash)
  }

  async function init() {
    try {
      const res = await configApi.getConfig()
      writeMode.value = res.data.write_mode ?? false
      roots.value     = res.data.roots
      await loadDirectory(getHashPath())
    } catch (e) {
      error.value = e.message
    }
  }

  async function _fetchPage(path, p, push = false) {
    loading.value = true
    error.value   = null
    try {
      const res         = await filesApi.listDirectory(path, p, pageSize.value, filterPattern.value || null, sortBy.value, sortOrder.value)
      currentPath.value = res.data.path
      entries.value = res.data.entries
      total.value   = res.data.total
      page.value        = p
      writeHash(res.data.path, push)
    } catch (e) {
      error.value = e.message
      if (path !== '' && p === 1) await loadDirectory('')
    } finally {
      loading.value = false
    }
  }

  async function loadDirectory(path, push = false) {
    entries.value = []
    total.value   = 0
    page.value            = 1
    selectedEntries.value = []
    selectionAnchor.value = null
    if (path === '') {
      loading.value     = false
      currentPath.value = ''
      writeHash('', push)
      return
    }
    await _fetchPage(path, 1, push)
  }

  async function goToPage(p) {
    await _fetchPage(currentPath.value, p)
  }

  function navigate(path) {
    filterPattern.value = ''
    loadDirectory(path, true)
  }

  window.addEventListener('popstate', () => {
    const path = getHashPath()
    if (path !== currentPath.value) loadDirectory(path)
  })

  return {
    rootName, currentPath, entries, displayEntries, loading, error, viewMode, breadcrumbs,
    page, pageSize, total, selectedEntry, selectedEntries, writeMode, roots,
    isAtHome, treeRevision, filterPattern, sortBy, sortOrder,
    clipboard, nameConflicts,
    contextMenuFile, isContextMenuTarget, setContextMenuFile,
    init, loadDirectory, goToPage, navigate,
    selectEntry, toggleEntry, shiftSelectTo, addToSelection, clearSelection, setSelection,
    invalidateTree, setFilter, setSort,
    setCopy, setCut, clearClipboard, paste, pasteAsLink, resolveNameConflicts, cancelNameConflicts, deleteEntries,
    setRefreshHook, refresh,
  }
})
