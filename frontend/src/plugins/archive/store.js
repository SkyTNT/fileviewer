import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { archiveApi, writeApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useTaskStore } from '@/plugins/task/store.js'
import CompressTaskItem from './CompressTaskItem.vue'
import ExtractTaskItem  from './ExtractTaskItem.vue'

export const useArchiveStore = defineStore('archive', () => {
  // ── Compress settings dialog ───────────────────────────────────────────────────
  const compressDialog  = ref(false)
  const compressSources = ref([])

  function openCompress(entries) {
    compressSources.value = Array.isArray(entries) ? [...entries] : [entries]
    compressDialog.value  = true
  }

  async function startCompress(sources, outputPath, format, level, password, excludes) {
    const fileStore   = useFileStore()
    const taskStore   = useTaskStore()
    const outputName  = outputPath.split('/').pop()
    const data = reactive({ outputName, done: 0, total: 0, current: '' })
    const task = taskStore.add({ component: CompressTaskItem, data })

    try {
      const res     = await archiveApi.create(sources, outputPath, format, level, password, excludes)
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
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'progress') {
              data.done    = ev.done
              data.total   = ev.total
              data.current = ev.name || ''
            } else if (ev.type === 'error') {
              task.errors.push(ev.message || 'Error')
            } else if (ev.type === 'warning') {
              task.errors.push('⚠ ' + ev.message)
            } else if (ev.type === 'done') {
              const hasRealErrors = task.errors.some(e => !e.startsWith('⚠'))
              task.status = hasRealErrors ? 'error' : 'done'
              fileStore.refresh()
              fileStore.invalidateTree?.()
            }
          } catch { /* bad SSE */ }
        }
      }
    } catch (e) {
      task.errors.push(e.message)
      task.status = 'error'
    }
  }

  // ── Extract ───────────────────────────────────────────────────────────────────
  // extractDialog is now only for the password prompt phase
  const extractDialog  = ref(false)
  const extractPassword = ref('')
  const _extractPending = ref(null)  // { file, dest } while waiting for password

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

    let needsPassword = false
    try {
      const info = await archiveApi.getInfo(file.path, null)
      if (info.data.encrypted) needsPassword = true
    } catch (e) {
      if (e.response?.status === 401) needsPassword = true
    }

    if (needsPassword) {
      _extractPending.value = { file, dest }
      extractDialog.value   = true
      return
    }

    const strategy = await _checkConflicts(file, dest, null)
    if (strategy === null) return

    _runExtract(file, dest, null, strategy)   // fire and forget
  }

  async function confirmExtract() {
    const pwd            = extractPassword.value || null
    const { file, dest } = _extractPending.value
    extractDialog.value   = false
    extractPassword.value = ''
    _extractPending.value = null

    const strategy = await _checkConflicts(file, dest, pwd)
    if (strategy === null) return

    _runExtract(file, dest, pwd, strategy)    // fire and forget
  }

  function closeExtract() {
    extractDialog.value   = false
    extractPassword.value = ''
    _extractPending.value = null
  }

  async function _runExtract(file, dest, password, strategy = 'overwrite') {
    const fileStore = useFileStore()
    const taskStore = useTaskStore()
    const data = reactive({ fileName: file.name, done: 0, total: 0 })
    const task = taskStore.add({ component: ExtractTaskItem, data })

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
            const ev = JSON.parse(line.slice(6))
            if (ev.type === 'progress') {
              data.done  = ev.done
              data.total = ev.total
            } else if (ev.type === 'error') {
              task.errors.push(ev.message || ev.name || 'Error')
            } else if (ev.type === 'done') {
              task.status = task.errors.length ? 'error' : 'done'
              fileStore.refresh()
              fileStore.invalidateTree()
            }
          } catch { /* bad SSE */ }
        }
      }
    } catch (e) {
      task.errors.push(e.message)
      task.status = 'error'
    }
  }

  return {
    compressDialog, compressSources, openCompress, startCompress,
    extractDialog, extractPassword, extractHere, extractToSubfolder,
    confirmExtract, closeExtract,
  }
})
