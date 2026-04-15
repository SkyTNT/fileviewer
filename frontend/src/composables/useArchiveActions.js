import { ref } from 'vue'
import { archiveApi, writeApi } from '../services/api.js'
import { useFileStore } from '../stores/fileStore.js'

// Module-level singletons — shared state across all components
const _compressDialog  = ref(false)
const _compressSources = ref([])

const _extractDialog   = ref(false)
const _extractPassword = ref('')
// phase: 'password' | 'running' | 'done'
const _extractProgress = ref({ phase: 'running', file: null, dest: null, done: 0, total: 0, errors: [], finished: false })

export function useArchiveActions() {
  const store = useFileStore()

  // ── compress ────────────────────────────────────────────────────────────────
  function openCompress(entries) {
    _compressSources.value = Array.isArray(entries) ? [...entries] : [entries]
    _compressDialog.value  = true
  }

  // ── extract ─────────────────────────────────────────────────────────────────
  async function extractHere(file) {
    await _doExtract(file, store.currentPath)
  }

  async function extractToSubfolder(file) {
    const name = file.name
    let folder = name
    for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz']) {
      if (name.toLowerCase().endsWith(ext)) { folder = name.slice(0, -ext.length); break }
    }
    if (folder === name) {
      const dot = name.lastIndexOf('.')
      if (dot > 0) folder = name.slice(0, dot)
    }
    const dest = store.currentPath + '/' + folder
    try { await writeApi.mkdir(store.currentPath, folder) } catch { /* already exists */ }
    await _doExtract(file, dest)
  }

  async function _checkConflicts(file, dest, password) {
    try {
      const res = await archiveApi.checkConflicts(file.path, dest, password)
      if (!res.data.conflicts.length) return 'overwrite'
      return new Promise((resolve) => {
        store.nameConflicts = { conflicts: res.data.conflicts, resolve }
      })
    } catch {
      return 'overwrite'  // ignore check errors, proceed
    }
  }

  async function _doExtract(file, dest) {
    _extractPassword.value = ''
    _extractDialog.value   = true
    _extractProgress.value = { phase: 'running', file, dest, done: 0, total: 0, errors: [], finished: false }

    // Check if archive needs a password before starting
    let needsPassword = false
    try {
      const info = await archiveApi.getInfo(file.path, null)
      if (info.data.encrypted) needsPassword = true
    } catch (e) {
      if (e.response?.status === 401) needsPassword = true
    }

    if (needsPassword) {
      _extractProgress.value.phase = 'password'
      return
    }

    const strategy = await _checkConflicts(file, dest, null)
    if (strategy === null) { _extractDialog.value = false; return }

    await _runExtract(file, dest, null, strategy)
  }

  async function confirmExtract() {
    const { file, dest } = _extractProgress.value
    const pwd = _extractPassword.value || null
    _extractProgress.value.phase    = 'running'
    _extractProgress.value.done     = 0
    _extractProgress.value.total    = 0
    _extractProgress.value.errors   = []
    _extractProgress.value.finished = false

    const strategy = await _checkConflicts(file, dest, pwd)
    if (strategy === null) { _extractDialog.value = false; return }

    await _runExtract(file, dest, pwd, strategy)
  }

  async function _runExtract(file, dest, password, strategy = 'overwrite') {
    try {
      const res = await archiveApi.extract(file.path, dest, password, null, strategy)
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
            if (data.type === 'progress') {
              _extractProgress.value.done  = data.done
              _extractProgress.value.total = data.total
            } else if (data.type === 'error') {
              _extractProgress.value.errors.push(data.message || data.name || 'Error')
            } else if (data.type === 'done') {
              _extractProgress.value.finished = true
              _extractProgress.value.phase    = 'done'
              store.refresh()
              if (store.invalidateTree) store.invalidateTree()
            }
          } catch { /* bad SSE */ }
        }
      }
    } catch (e) {
      _extractProgress.value.errors.push(e.message)
      _extractProgress.value.finished = true
      _extractProgress.value.phase    = 'done'
    }
  }

  function closeExtract() {
    _extractDialog.value   = false
    _extractPassword.value = ''
    _extractProgress.value = { phase: 'running', file: null, dest: null, done: 0, total: 0, errors: [], finished: false }
  }

  return {
    compressDialog:  _compressDialog,
    compressSources: _compressSources,
    openCompress,
    extractDialog:   _extractDialog,
    extractPassword: _extractPassword,
    extractProgress: _extractProgress,
    extractHere,
    extractToSubfolder,
    confirmExtract,
    closeExtract,
  }
}
