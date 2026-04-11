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
  const selectedEntry = ref(null)
  const writeMode     = ref(false)
  const treeRevision  = ref(0)
  const filterPattern = ref('')
  const clipboard     = ref(null) // { entry, action: 'copy' | 'cut' }

  function invalidateTree() { treeRevision.value++ }

  function setCopy(entry) { clipboard.value = { entry, action: 'copy' } }
  function setCut(entry)  { clipboard.value = { entry, action: 'cut'  } }
  function clearClipboard() { clipboard.value = null }

  async function paste() {
    if (!clipboard.value) return
    const { entry, action } = clipboard.value
    if (action === 'copy') {
      await writeApi.copy(entry.path, currentPath.value)
    } else {
      await writeApi.move(entry.path, currentPath.value)
      clipboard.value = null
    }
    invalidateTree()
    await loadDirectory(currentPath.value)
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

  function selectEntry(entry) {
    if (!entry) { selectedEntry.value = null; return }
    selectedEntry.value = selectedEntry.value?.path === entry.path ? null : entry
  }

  async function loadDirectory(path, push = false) {
    // Clear immediately so views can detect a fresh load
    entries.value       = []
    total.value         = 0
    page.value          = 1
    selectedEntry.value = null
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
    page, pageSize, total, selectedEntry, writeMode, treeRevision, filterPattern,
    clipboard,
    init, loadDirectory, goToPage, navigate, selectEntry, invalidateTree, setFilter,
    setCopy, setCut, clearClipboard, paste,
  }
})
