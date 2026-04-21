import { reactive, markRaw } from 'vue'
import CompressTaskItem from './CompressTaskItem.vue'
import ExtractTaskItem  from './ExtractTaskItem.vue'
import DialogCompress        from './dialogs/DialogCompress.vue'
import DialogExtractProgress from './dialogs/DialogExtractProgress.vue'
export function createArchiveState(explorerState, taskState, winMgr, archiveApi, writeApi, readSSE, openConflictDialog) {
  function openCompress(entries) {
    const sources = Array.isArray(entries) ? [...entries] : [entries]
    winMgr.open({
      id: 'dialog:compress',
      title: 'Compress',
      icon: 'mdi-archive-plus-outline',
      component: markRaw(DialogCompress),
      width: 640,
      height: 520,
      props: { sources },
    })
  }

  async function startCompress(sources, outputPath, format, level, password, excludes) {
    const outputName = outputPath.split('/').pop()
    const data = reactive({ outputName, phase: 'scanning', scan_count: 0, done: 0, total: 0, current: '', bytes_done: 0, bytes_total: 0 })
    const abort = new AbortController()
    const task  = taskState.add({
      component: CompressTaskItem,
      data,
      cancel: () => abort.abort(),
    })

    try {
      const res = await archiveApi.create(sources, outputPath, format, level, password, excludes, abort.signal)
      await readSSE(res, (ev) => {
        if (ev.type === 'scanning') {
          data.scan_count = ev.count
        } else if (ev.type === 'progress') {
          data.phase       = 'compressing'
          data.done        = ev.done
          data.total       = ev.total
          data.current     = ev.name || ''
          data.bytes_done  = ev.bytes_done  ?? data.bytes_done
          data.bytes_total = ev.bytes_total ?? data.bytes_total
        } else if (ev.type === 'error') {
          task.errors.push(ev.message || 'Error')
        } else if (ev.type === 'warning') {
          task.errors.push('⚠ ' + ev.message)
        } else if (ev.type === 'done') {
          const hasRealErrors = task.errors.some(e => !e.startsWith('⚠'))
          task.status = hasRealErrors ? 'error' : 'done'
          explorerState.refresh()
          explorerState.invalidateTree?.()
        }
      })
      if (task.status === 'running') { task.errors.push('Unexpected end of stream'); task.status = 'error' }
    } catch (e) {
      if (e.name === 'AbortError') { task.status = 'error'; task.errors.push('cancelled') }
      else { task.errors.push(e.message); task.status = 'error' }
    }
  }

  async function extractHere(file) {
    await _doExtract(file, explorerState.currentPath)
  }

  async function extractToSubfolder(file) {
    const name  = file.name
    let folder  = name
    for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz']) {
      if (name.toLowerCase().endsWith(ext)) { folder = name.slice(0, -ext.length); break }
    }
    if (folder === name) {
      const dot = name.lastIndexOf('.')
      if (dot > 0) folder = name.slice(0, dot)
    }
    const dest = explorerState.currentPath + '/' + folder
    try { await writeApi.mkdir(explorerState.currentPath, folder) } catch { /* already exists */ }
    await _doExtract(file, dest)
  }

  async function _checkConflicts(file, dest, password) {
    try {
      const res = await archiveApi.checkConflicts(file.path, dest, password)
      if (!res.data.conflicts.length) return 'overwrite'
      return openConflictDialog(res.data.conflicts)
    } catch {
      return 'overwrite'
    }
  }

  async function _doExtract(file, dest) {
    let needsPassword = false
    try {
      const res = await archiveApi.getInfo(file.path, null)
      if (res.ok) {
        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        outer: while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          for (const part of buf.split('\n\n')) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            try {
              const ev = JSON.parse(line.slice(5).trim())
              if (ev.type === 'meta') { needsPassword = ev.encrypted; break outer }
              if (ev.type === 'error' && ev.code === 'password_required') { needsPassword = true; break outer }
            } catch {}
          }
          buf = buf.slice(buf.lastIndexOf('\n\n') + 2)
        }
        reader.cancel()
      } else if (res.status === 422) {
        needsPassword = true
      }
    } catch { /* ignore */ }

    if (needsPassword) {
      winMgr.open({
        id: 'dialog:extract-password',
        title: 'Password Required',
        icon: 'mdi-lock-outline',
        component: markRaw(DialogExtractProgress),
        width: 420,
        height: 220,
        props: {
          onConfirm: async (pwd) => {
            const strategy = await _checkConflicts(file, dest, pwd || null)
            if (strategy === null) return
            _runExtract(file, dest, pwd || null, strategy)
          },
          onCancel: () => {},
        },
      })
      return
    }

    const strategy = await _checkConflicts(file, dest, null)
    if (strategy === null) return
    _runExtract(file, dest, null, strategy)
  }

  async function _runExtract(file, dest, password, strategy = 'overwrite') {
    const data  = reactive({ done: 0, total: 0, current: '' })
    const abort = new AbortController()
    const task  = taskState.add({ component: ExtractTaskItem, data, cancel: () => abort.abort() })

    try {
      const res = await archiveApi.extract(file.path, dest, password, null, strategy, abort.signal)
      await readSSE(res, (ev) => {
        if (ev.type === 'progress') {
          data.done    = ev.done
          data.total   = ev.total
          data.current = ev.name || ''
        } else if (ev.type === 'error') {
          task.errors.push(ev.message || ev.name || 'Error')
        } else if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          explorerState.refresh()
          explorerState.invalidateTree()
        }
      })
      if (task.status === 'running') { task.errors.push('Unexpected end of stream'); task.status = 'error' }
    } catch (e) {
      if (e.name === 'AbortError') task.errors.push('cancelled')
      else task.errors.push(e.message)
      task.status = 'error'
    }
  }

  return reactive({
    openCompress, startCompress,
    extractHere, extractToSubfolder,
  })
}
