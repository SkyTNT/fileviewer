import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { filesApi, configApi, writeApi } from '../services/api.js'

export const useFileStore = defineStore('file', () => {
  const rootName    = ref('Root')
  const currentPath = ref('')
  const entries     = ref([])
  const loading     = ref(false)
  const error       = ref(null)
  const viewMode    = ref('waterfall')
  const page          = ref(1)
  const pageSize      = ref(50)
  const total         = ref(0)
  const selectedEntries = ref([])   // all selected file objects
  const selectedEntry   = computed(() =>   // single-select compat
    selectedEntries.value.length === 1 ? selectedEntries.value[0] : null
  )
  const writeMode     = ref(false)
  const multiRoot     = ref(false)
  const treeRevision  = ref(0)
  const filterPattern = ref('')
  const clipboard      = ref(null)  // { entries: [...], action: 'copy' | 'cut' }
  const pasteProgress  = ref(null)  // { done, total, action } | null
  const deleteProgress = ref(null)  // { done, total } | null

  function invalidateTree() { treeRevision.value++ }

  function selectEntry(entry) {
    if (!entry) { selectedEntries.value = []; return }
    const isSame = selectedEntries.value.length === 1 && selectedEntries.value[0].path === entry.path
    selectedEntries.value = isSame ? [] : [entry]
  }

  function toggleEntry(entry) {
    const idx = selectedEntries.value.findIndex(e => e.path === entry.path)
    if (idx >= 0) selectedEntries.value = selectedEntries.value.filter((_, i) => i !== idx)
    else          selectedEntries.value = [...selectedEntries.value, entry]
  }

  function clearSelection()        { selectedEntries.value = [] }
  function setSelection(entries)  { selectedEntries.value = [...entries] }

  function setCopy(entry) {
    const all = selectedEntries.value
    const entries = (all.length > 1 && all.some(e => e.path === entry.path)) ? [...all] : [entry]
    clipboard.value = { entries, action: 'copy' }
  }
  function setCut(entry) {
    const all = selectedEntries.value
    const entries = (all.length > 1 && all.some(e => e.path === entry.path)) ? [...all] : [entry]
    clipboard.value = { entries, action: 'cut' }
  }
  function clearClipboard() { clipboard.value = null }

  async function deleteEntries(entries) {
    deleteProgress.value = { done: 0, total: entries.length }
    try {
      for (const entry of entries) {
        await writeApi.delete(entry.path)
        deleteProgress.value = { done: deleteProgress.value.done + 1, total: entries.length }
      }
      clearSelection()
      invalidateTree()
      await loadDirectory(currentPath.value)
    } finally {
      deleteProgress.value = null
    }
  }

  async function paste() {
    if (!clipboard.value) return
    const { entries, action } = clipboard.value
    pasteProgress.value = { done: 0, total: entries.length, action }
    try {
      for (const entry of entries) {
        if (action === 'copy') await writeApi.copy(entry.path, currentPath.value)
        else                   await writeApi.move(entry.path, currentPath.value)
        pasteProgress.value = { done: pasteProgress.value.done + 1, total: entries.length, action }
      }
      if (action === 'cut') clipboard.value = null
      invalidateTree()
      await loadDirectory(currentPath.value)
    } finally {
      pasteProgress.value = null
    }
  }

  function setFilter(pattern) {
    filterPattern.value = pattern
    loadDirectory(currentPath.value)
  }

  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean)
    const crumbs = [{ name: rootName.value, path: '' }]
    let cum = ''
    for (const part of parts) {
      cum = cum ? cum + '/' + part : part
      crumbs.push({ name: part, path: cum })
    }
    return crumbs
  })

  // ── Hash helpers ─────────────────────────────────────────────────────────────
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

  // ── Core ─────────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const [rootRes, cfgRes] = await Promise.all([filesApi.getRoot(), configApi.getConfig()])
      rootName.value  = rootRes.data.name || 'Root'
      writeMode.value = cfgRes.data.write_mode ?? false
      multiRoot.value = (cfgRes.data.roots?.length ?? 1) > 1
      await loadDirectory(getHashPath())
    } catch (e) {
      error.value = e.message
    }
  }

  async function _fetchPage(path, p, push = false) {
    loading.value = true
    error.value   = null
    try {
      const res         = await filesApi.listDirectory(path, p, pageSize.value, filterPattern.value || null)
      currentPath.value = res.data.path
      entries.value     = res.data.entries
      total.value       = res.data.total
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
    // Clear immediately so views can detect a fresh load
    entries.value         = []
    total.value           = 0
    page.value            = 1
    selectedEntries.value = []
    await _fetchPage(path, 1, push)
  }

  async function goToPage(p) {
    await _fetchPage(currentPath.value, p)
  }

  // Called from UI: add a history entry so back-button works
  function navigate(path) {
    filterPattern.value = ''
    loadDirectory(path, true)
  }

  // Browser back / forward
  window.addEventListener('popstate', () => {
    const path = getHashPath()
    if (path !== currentPath.value) loadDirectory(path)
  })

  return {
    rootName, currentPath, entries, loading, error, viewMode, breadcrumbs,
    page, pageSize, total, selectedEntry, selectedEntries, writeMode, multiRoot, treeRevision, filterPattern,
    clipboard, pasteProgress, deleteProgress,
    init, loadDirectory, goToPage, navigate, selectEntry, toggleEntry, clearSelection, setSelection, invalidateTree, setFilter,
    setCopy, setCut, clearClipboard, paste, deleteEntries,
  }
})
