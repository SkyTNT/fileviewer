import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
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
  const selectedEntries  = ref([])   // all selected file objects
  const selectionAnchor  = ref(null) // last non-shift-clicked item, for range select
  const selectedEntry    = computed(() =>   // single-select compat
    selectedEntries.value.length === 1 ? selectedEntries.value[0] : null
  )
  const writeMode     = ref(false)
  const roots         = ref([])   // [{ slug, name, disk: {total,used,free}|null }]
  const treeRevision  = ref(0)
  const filterPattern = ref('')
  const clipboard      = ref(null)  // { entries: [...], action: 'copy' | 'cut' }
  const pasteProgress  = ref(null)  // { done, total, action } | null
  const deleteProgress = ref(null)  // { done, total } | null
  const nameConflicts  = ref(null)  // { conflicts: [{name}], resolve: fn } | null

  // ── Upload state ──────────────────────────────────────────────────────────────
  const uploadTasks   = ref([])    // reactive task objects
  const _uploadFiles  = new Map()  // id → File, kept outside reactivity
  let _uploadNextId   = 1
  let _uploadRafId    = null

  function invalidateTree() { treeRevision.value++ }

  // ── Refresh hook ──────────────────────────────────────────────────────────────
  // Active view registers its own refresh strategy so write ops don't reset page.
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

  // Range select from anchor to entry within visibleEntries (current page / loaded items)
  function shiftSelectTo(entry, visibleEntries) {
    if (!selectionAnchor.value) { selectEntry(entry); return }
    const anchorIdx = visibleEntries.findIndex(e => e.path === selectionAnchor.value.path)
    const targetIdx = visibleEntries.findIndex(e => e.path === entry.path)
    if (anchorIdx === -1) { selectEntry(entry); return }
    const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
    selectedEntries.value = visibleEntries.slice(from, to + 1)
    // anchor does not change on shift-click
  }

  // Additive: merge new items into selection without clearing existing (Ctrl+rubber-band)
  function addToSelection(newEntries) {
    const existing = new Set(selectedEntries.value.map(e => e.path))
    const toAdd = newEntries.filter(e => !existing.has(e.path))
    if (toAdd.length) selectedEntries.value = [...selectedEntries.value, ...toAdd]
  }

  function clearSelection()       { selectedEntries.value = []; selectionAnchor.value = null }
  function setSelection(entries)  { selectedEntries.value = [...entries]; selectionAnchor.value = entries.at(-1) ?? null }

  function setCopy(entries) {
    clipboard.value = { entries: Array.isArray(entries) ? entries : [entries], action: 'copy' }
  }
  function setCut(entries) {
    clipboard.value = { entries: Array.isArray(entries) ? entries : [entries], action: 'cut' }
  }
  function clearClipboard() { clipboard.value = null }

  async function _readSSE(response, onEvent) {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        try { onEvent(JSON.parse(line.slice(5).trim())) } catch {}
      }
    }
  }

  async function deleteEntries(entries) {
    deleteProgress.value = { done: 0, total: entries.length }
    const errors = []
    try {
      const response = await writeApi.delete(entries.map(e => e.path))
      await _readSSE(response, (ev) => {
        if (ev.type === 'progress' || ev.type === 'error')
          deleteProgress.value = { done: ev.done, total: ev.total }
        if (ev.type === 'error')
          errors.push(ev.name ? `${ev.name}: ${ev.message}` : ev.message)
        if (ev.type === 'done') {
          clearSelection()
          invalidateTree()
          refresh()
        }
      })
    } finally {
      deleteProgress.value = null
    }
    if (errors.length)
      throw new Error(errors.length === 1 ? errors[0] : `${errors.length} items failed:\n${errors.join('\n')}`)
  }

  async function _executePaste(entries, action, destDir, onConflict) {
    pasteProgress.value = { done: 0, total: entries.length, action }
    const errors = []
    try {
      const response = await writeApi.paste(entries, action, destDir, onConflict)
      await _readSSE(response, (ev) => {
        if (ev.type === 'progress' || ev.type === 'error')
          pasteProgress.value = { done: ev.done, total: ev.total, action }
        if (ev.type === 'error')
          errors.push(ev.name ? `${ev.name}: ${ev.message}` : ev.message)
        if (ev.type === 'done') {
          if (action === 'cut') clipboard.value = null
          invalidateTree()
          refresh()
        }
      })
    } finally {
      pasteProgress.value = null
    }
    if (errors.length)
      throw new Error(errors.length === 1 ? errors[0] : `${errors.length} items failed:\n${errors.join('\n')}`)
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

  function resolveNameConflicts(strategy) {
    nameConflicts.value?.resolve(strategy)
    nameConflicts.value = null
  }
  function cancelNameConflicts() { resolveNameConflicts(null) }

  // ── Upload ────────────────────────────────────────────────────────────────────
  function _uploadFile(task) {
    return new Promise((resolve) => {
      const file = _uploadFiles.get(task.id)
      const fd   = new FormData()
      fd.append('parent',      task.parent)
      fd.append('files',       file)
      fd.append('on_conflict', task.onConflict)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/write/upload')
      xhr.withCredentials = true

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) task.progress = Math.round(e.loaded / e.total * 100)
      })

      xhr.addEventListener('load', () => {
        _uploadFiles.delete(task.id)
        if (xhr.status >= 200 && xhr.status < 300) {
          task.progress = 100
          task.status   = 'done'
        } else {
          task.status = 'error'
          try   { task.error = JSON.parse(xhr.responseText)?.detail || xhr.statusText }
          catch { task.error = xhr.statusText }
        }
        resolve()
      })

      xhr.addEventListener('error', () => {
        _uploadFiles.delete(task.id)
        task.status = 'error'
        task.error  = 'Network error'
        resolve()
      })

      xhr.send(fd)
    })
  }

  function _scheduleUploadRefresh() {
    if (_uploadRafId) return
    _uploadRafId = requestAnimationFrame(() => {
      _uploadRafId = null
      refresh()
    })
  }

  function _startUploads(parent, files, onConflict) {
    files.forEach((file) => {
      const id   = _uploadNextId++
      const task = reactive({ id, name: file.name, parent, onConflict, progress: 0, status: 'uploading', error: null })
      _uploadFiles.set(id, file)
      uploadTasks.value.push(task)
      _uploadFile(task).then(() => {
        if (task.status === 'done') _scheduleUploadRefresh()
      })
    })
  }

  async function addUploads(parent, files) {
    try {
      const res  = await writeApi.checkConflicts(files.map(f => ({ name: f.name, dest_parent: parent })))
      const data = res.data

      if (data.conflicts?.length > 0) {
        const strategy = await new Promise((resolve) => {
          nameConflicts.value = { conflicts: data.conflicts, resolve }
        })
        if (!strategy) return
        _startUploads(parent, files, strategy)
        return
      }
    } catch {
      // If the check fails, proceed with default overwrite
    }

    _startUploads(parent, files, 'overwrite')
  }

  function clearUploadsDone() {
    uploadTasks.value = uploadTasks.value.filter(t => t.status === 'uploading')
  }

  function clearAllUploads() {
    uploadTasks.value = []
  }

  function removeUploadTask(id) {
    uploadTasks.value = uploadTasks.value.filter(t => t.id !== id)
    _uploadFiles.delete(id)
  }

  function setFilter(pattern) {
    filterPattern.value = pattern
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
      // First segment is always the root slug — show its display name
      let name = part
      if (i === 0) {
        const root = roots.value.find(r => r.slug === part)
        if (root) name = root.name
      }
      crumbs.push({ name, path: cum })
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
    entries.value         = []
    total.value           = 0
    page.value            = 1
    selectedEntries.value = []
    selectionAnchor.value = null
    // Home page has no real directory — RootsView handles the display.
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
    page, pageSize, total, selectedEntry, selectedEntries, writeMode, roots, isAtHome, treeRevision, filterPattern,
    clipboard, pasteProgress, deleteProgress, nameConflicts,
    uploadTasks,
    init, loadDirectory, goToPage, navigate, selectEntry, toggleEntry, shiftSelectTo, addToSelection, clearSelection, setSelection, invalidateTree, setFilter,
    setCopy, setCut, clearClipboard, paste, resolveNameConflicts, cancelNameConflicts, deleteEntries,
    addUploads, clearUploadsDone, clearAllUploads, removeUploadTask,
    setRefreshHook, refresh,
  }
})
