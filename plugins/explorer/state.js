import { ref, computed, reactive } from 'vue'

export function createExplorerState(filesApi) {
  const rootName           = ref('Root')
  const currentPath        = ref('')
  const entries            = ref([])
  const loading            = ref(false)
  const error              = ref(null)
  const page               = ref(1)
  const pageSize           = ref(50)
  const total              = ref(0)
  const selectedEntries    = ref([])
  const selectionAnchor    = ref(null)
  const writeMode          = ref(false)
  const roots              = ref([])
  const treeRevision       = ref(0)
  const filterPattern      = ref('')
  const mobileMultiSelectMode = ref(false)
  const displayedEntries   = ref([])
  const sortBy             = ref(localStorage.getItem('fv-sort-by')    || 'name')
  const sortOrder          = ref(localStorage.getItem('fv-sort-order') || 'asc')
  const clipboard          = ref(null)
  const nameConflicts      = ref(null)
  const contextMenuFile    = ref(null)

  const selectedEntry = computed(() =>
    selectedEntries.value.length === 1 ? selectedEntries.value[0] : null
  )
  const isContextMenuTarget = computed(() =>
    contextMenuFile.value != null &&
    selectedEntries.value.some(e => e.path === contextMenuFile.value?.path)
  )
  // Effective selection for context menu: if right-clicked file is not in selection, use it alone
  const ctxSel = computed(() => {
    const s = selectedEntries.value
    const f = contextMenuFile.value
    if (f && !s.some(e => e.path === f.path)) return [f]
    return s
  })
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

  function setContextMenuFile(f) { contextMenuFile.value = f }
  function invalidateTree() { treeRevision.value++ }

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
  function clearSelection()       { selectedEntries.value = []; selectionAnchor.value = null }
  function setSelection(ents)     { selectedEntries.value = [...ents]; selectionAnchor.value = ents.at(-1) ?? null }
  function setDisplayedEntries(e) { displayedEntries.value = e }
  function enterMobileMultiSelect() { mobileMultiSelectMode.value = true }
  function exitMobileMultiSelect(keepSelection = false) {
    if (!keepSelection) clearSelection()
    mobileMultiSelectMode.value = false
  }
  function selectAll()       { setSelection(displayedEntries.value) }
  function invertSelection() {
    const sel = new Set(selectedEntries.value.map(e => e.path))
    setSelection(displayedEntries.value.filter(e => !sel.has(e.path)))
  }
  function setCopy(ents)     { clipboard.value = { entries: Array.isArray(ents) ? ents : [ents], action: 'copy' } }
  function setCut(ents)      { clipboard.value = { entries: Array.isArray(ents) ? ents : [ents], action: 'cut' } }
  function setCopyLink(ents) { clipboard.value = { entries: Array.isArray(ents) ? ents : [ents], action: 'link' } }
  function clearClipboard()  { clipboard.value = null }
  function resolveNameConflicts(strategy) { nameConflicts.value?.resolve(strategy); nameConflicts.value = null }
  function cancelNameConflicts() { resolveNameConflicts(null) }
  function setFilter(pattern) { filterPattern.value = pattern; loadDirectory(currentPath.value) }
  function setSort(by, order) {
    sortBy.value    = by
    sortOrder.value = order
    localStorage.setItem('fv-sort-by',    by)
    localStorage.setItem('fv-sort-order', order)
    invalidateTree()
    loadDirectory(currentPath.value)
  }

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

  async function _fetchPage(path, p, push = false) {
    loading.value = true
    error.value   = null
    try {
      const res = await filesApi.listDirectory(path, p, pageSize.value, filterPattern.value || null, sortBy.value, sortOrder.value)
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
    entries.value               = []
    total.value                 = 0
    page.value                  = 1
    selectedEntries.value       = []
    selectionAnchor.value       = null
    mobileMultiSelectMode.value = false
    if (path === '') {
      loading.value     = false
      currentPath.value = ''
      writeHash('', push)
      return
    }
    await _fetchPage(path, 1, push)
  }

  async function goToPage(p) { await _fetchPage(currentPath.value, p) }

  function navigate(path) { filterPattern.value = ''; loadDirectory(path, true) }

  window.addEventListener('popstate', () => {
    const path = getHashPath()
    if (path !== currentPath.value) loadDirectory(path)
  })

  async function init() {
    try {
      await loadDirectory(getHashPath())
    } catch (e) {
      error.value = e.message
    }
  }

  return reactive({
    rootName, currentPath, entries, loading, error, breadcrumbs,
    page, pageSize, total, selectedEntry, selectedEntries, writeMode, roots,
    isAtHome, treeRevision, filterPattern, sortBy, sortOrder,
    clipboard, nameConflicts,
    contextMenuFile, isContextMenuTarget, ctxSel, setContextMenuFile,
    mobileMultiSelectMode, displayedEntries,
    init, loadDirectory, goToPage, navigate,
    selectEntry, toggleEntry, shiftSelectTo, addToSelection, clearSelection, setSelection,
    setDisplayedEntries, enterMobileMultiSelect, exitMobileMultiSelect, selectAll, invertSelection,
    invalidateTree, setFilter, setSort,
    setCopy, setCut, setCopyLink, clearClipboard, resolveNameConflicts, cancelNameConflicts,
    setRefreshHook, refresh,
  })
}
