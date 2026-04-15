import { defineStore } from 'pinia'
import { ref } from 'vue'
import { archiveApi, writeApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'

export const useArchiveStore = defineStore('archive', () => {
  const compressDialog  = ref(false)
  const compressSources = ref([])

  const extractDialog   = ref(false)
  const extractPassword = ref('')
  const extractProgress = ref({
    phase: 'running', file: null, dest: null,
    done: 0, total: 0, errors: [], finished: false,
  })

  // ── Compress ──────────────────────────────────────────────────────────────────
  function openCompress(entries) {
    compressSources.value = Array.isArray(entries) ? [...entries] : [entries]
    compressDialog.value  = true
  }

  // ── Extract ───────────────────────────────────────────────────────────────────
  async function extractHere(file) {
    await _doExtract(file, useFileStore().currentPath)
  }

  async function extractToSubfolder(file) {
    const store = useFileStore()
    const name  = file.name
    let folder  = name
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
    const fileStore = useFileStore()
    try {
      const res = await archiveApi.checkConflicts(file.path, dest, password)
      if (!res.data.conflicts.length) return 'overwrite'
      return new Promise((resolve) => {
        fileStore.nameConflicts = { conflicts: res.data.conflicts, resolve }
      })
    } catch {
      return 'overwrite'
    }
  }

  async function _doExtract(file, dest) {
    extractPassword.value = ''
    extractDialog.value   = true
    extractProgress.value = { phase: 'running', file, dest, done: 0, total: 0, errors: [], finished: false }

    let needsPassword = false
    try {
      const info = await archiveApi.getInfo(file.path, null)
      if (info.data.encrypted) needsPassword = true
    } catch (e) {
      if (e.response?.status === 401) needsPassword = true
    }

    if (needsPassword) {
      extractProgress.value.phase = 'password'
      return
    }

    const strategy = await _checkConflicts(file, dest, null)
    if (strategy === null) { extractDialog.value = false; return }

    await _runExtract(file, dest, null, strategy)
  }

  async function confirmExtract() {
    const { file, dest } = extractProgress.value
    const pwd = extractPassword.value || null
    extractProgress.value.phase    = 'running'
    extractProgress.value.done     = 0
    extractProgress.value.total    = 0
    extractProgress.value.errors   = []
    extractProgress.value.finished = false

    const strategy = await _checkConflicts(file, dest, pwd)
    if (strategy === null) { extractDialog.value = false; return }

    await _runExtract(file, dest, pwd, strategy)
  }

  async function _runExtract(file, dest, password, strategy = 'overwrite') {
    const fileStore = useFileStore()
    try {
      const res     = await archiveApi.extract(file.path, dest, password, null, strategy)
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
              extractProgress.value.done  = data.done
              extractProgress.value.total = data.total
            } else if (data.type === 'error') {
              extractProgress.value.errors.push(data.message || data.name || 'Error')
            } else if (data.type === 'done') {
              extractProgress.value.finished = true
              extractProgress.value.phase    = 'done'
              fileStore.refresh()
              fileStore.invalidateTree()
            }
          } catch { /* bad SSE */ }
        }
      }
    } catch (e) {
      extractProgress.value.errors.push(e.message)
      extractProgress.value.finished = true
      extractProgress.value.phase    = 'done'
    }
  }

  function closeExtract() {
    extractDialog.value   = false
    extractPassword.value = ''
    extractProgress.value = { phase: 'running', file: null, dest: null, done: 0, total: 0, errors: [], finished: false }
  }

  return {
    compressDialog, compressSources, openCompress,
    extractDialog, extractPassword, extractProgress,
    extractHere, extractToSubfolder, confirmExtract, closeExtract,
  }
})
