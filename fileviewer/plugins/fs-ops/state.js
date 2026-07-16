import { reactive, markRaw } from 'vue'
import { getErrorMessage } from './errors.js'
import PasteTaskItem  from './PasteTaskItem.vue'
import DeleteTaskItem from './DeleteTaskItem.vue'
import DialogNewItem       from './dialogs/DialogNewItem.vue'
import DialogConfirmDelete from './dialogs/DialogConfirmDelete.vue'

export function createWriteState(explorerState, taskState, winMgr, writeApi, readSSE, openConflictFn, i18n) {
  const t = (key, params) => i18n.t(key, params)

  function openRename(file, onSuccess = null) {
    const state = reactive({ name: file?.name || '', loading: false, error: '' })
    winMgr.open({
      id: 'dialog:rename',
      title: t('dialog.renameTitle'),
      icon: 'mdi-pencil-outline',
      component: markRaw(DialogNewItem),
      width: 400,
      height: 180,
      props: {
        title: t('dialog.renameTitle'),
        label: t('dialog.newName'),
        get name()    { return state.name },
        get loading() { return state.loading },
        get error()   { return state.error },
        confirmText: t('dialog.rename'),
        'onUpdate:name': (v) => { state.name = v },
        onConfirm: async () => {
          const newName = state.name.trim()
          if (!newName || newName === file?.name) { winMgr.close('dialog:rename'); return }
          state.loading = true
          state.error   = ''
          try {
            await writeApi.rename(file.path, newName)
            winMgr.close('dialog:rename')
            explorerState.invalidateTree()
            explorerState.refresh()
            onSuccess?.()
          } catch (e) {
            state.error = getErrorMessage(e)
          } finally {
            state.loading = false
          }
        },
      },
    })
  }

  function openDelete(entries) {
    const targets = Array.isArray(entries) ? entries : [entries]
    winMgr.open({
      id: 'dialog:delete',
      title: targets.length > 1 ? t('dialog.deleteTitleN', { n: targets.length }) : t('dialog.deleteTitle'),
      icon: 'mdi-delete-outline',
      component: markRaw(DialogConfirmDelete),
      width: 400,
      height: 200,
      props: {
        targets,
        onConfirm: async () => {
          winMgr.close('dialog:delete')
          await deleteEntries(targets)
        },
      },
    })
  }

  function openMkdir() {
    const state = reactive({ name: '', loading: false, error: '' })
    winMgr.open({
      id: 'dialog:mkdir',
      title: t('dialog.newFolder'),
      icon: 'mdi-folder-plus-outline',
      component: markRaw(DialogNewItem),
      width: 400,
      height: 180,
      props: {
        label: t('dialog.folderName'),
        get name()    { return state.name },
        get loading() { return state.loading },
        get error()   { return state.error },
        'onUpdate:name': (v) => { state.name = v },
        onConfirm: async () => {
          const name = state.name.trim()
          if (!name) return
          state.loading = true
          state.error   = ''
          try {
            await writeApi.mkdir(explorerState.currentPath, name)
            winMgr.close('dialog:mkdir')
            explorerState.invalidateTree()
            explorerState.refresh()
          } catch (e) {
            state.error = getErrorMessage(e)
          } finally {
            state.loading = false
          }
        },
      },
    })
  }

  function openTouch() {
    const state = reactive({ name: '', loading: false, error: '' })
    winMgr.open({
      id: 'dialog:touch',
      title: t('dialog.newFile'),
      icon: 'mdi-file-plus-outline',
      component: markRaw(DialogNewItem),
      width: 400,
      height: 180,
      props: {
        label: t('dialog.fileName'),
        get name()    { return state.name },
        get loading() { return state.loading },
        get error()   { return state.error },
        'onUpdate:name': (v) => { state.name = v },
        onConfirm: async () => {
          const name = state.name.trim()
          if (!name) return
          state.loading = true
          state.error   = ''
          try {
            await writeApi.touch(explorerState.currentPath, name)
            winMgr.close('dialog:touch')
            explorerState.refresh()
          } catch (e) {
            state.error = getErrorMessage(e)
          } finally {
            state.loading = false
          }
        },
      },
    })
  }

  async function deleteEntries(entries) {
    const data  = reactive({ done: 0, total: entries.length, current: '' })
    const abort = new AbortController()
    const task  = taskState.add({ component: DeleteTaskItem, data, cancel: () => abort.abort() })
    try {
      const res = await writeApi.delete(entries.map(e => e.path), abort.signal)
      await readSSE(res, (ev) => {
        if (ev.type === 'progress') {
          data.done    = ev.done
          data.total   = ev.total
          data.current = ev.name || ''
        } else if (ev.type === 'error') {
          task.errors.push(ev.message || ev.name || 'Error')
        } else if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          explorerState.setSelection([])
          explorerState.invalidateTree()
          explorerState.refresh()
        }
      })
      if (task.status === 'running') { task.errors.push('Unexpected end of stream'); task.status = 'error' }
    } catch (e) {
      if (e.name === 'AbortError') task.errors.push('cancelled')
      else task.errors.push(e.message)
      task.status = 'error'
    }
  }

  async function doPaste() {
    if (!explorerState.clipboard) return
    const { entries, action } = explorerState.clipboard
    const destDir = explorerState.currentPath
    const res = await writeApi.checkConflicts(entries.map(e => ({ name: e.name, dest_parent: destDir })))
    if (res.data.conflicts.length > 0) {
      const strategy = await openConflictFn(res.data.conflicts)
      if (!strategy) return
      if (action === 'link') { await _executeLink(entries, destDir, strategy); return }
      await _executePaste(entries, action, destDir, strategy)
      return
    }
    if (action === 'link') { await _executeLink(entries, destDir, 'skip'); return }
    await _executePaste(entries, action, destDir, 'skip')
  }

  async function _executePaste(entries, action, destDir, strategy) {
    const data  = reactive({ action, done: 0, total: entries.length, current: '', bytes_done: 0, bytes_total: 0 })
    const abort = new AbortController()
    const task  = taskState.add({ component: PasteTaskItem, data, cancel: () => abort.abort() })
    try {
      const res = await writeApi.paste(entries, action, destDir, strategy, abort.signal)
      await readSSE(res, (ev) => {
        if (ev.type === 'progress') {
          data.done        = ev.done
          data.total       = ev.total
          data.current     = ev.name || ''
          data.bytes_done  = ev.bytes_done  ?? data.bytes_done
          data.bytes_total = ev.bytes_total ?? data.bytes_total
        } else if (ev.type === 'error') {
          task.errors.push(ev.message || ev.name || 'Error')
        } else if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          if (action === 'cut') explorerState.clearClipboard()
          explorerState.invalidateTree()
          explorerState.refresh()
        }
      })
      if (task.status === 'running') { task.errors.push('Unexpected end of stream'); task.status = 'error' }
    } catch (e) {
      if (e.name === 'AbortError') task.errors.push('cancelled')
      else task.errors.push(e.message)
      task.status = 'error'
    }
  }

  async function _executeLink(entries, destDir, strategy) {
    const data  = reactive({ action: 'link', done: 0, total: entries.length, current: '' })
    const abort = new AbortController()
    const task  = taskState.add({ component: PasteTaskItem, data, cancel: () => abort.abort() })
    try {
      const res = await writeApi.symlink(entries, destDir, strategy, abort.signal)
      await readSSE(res, (ev) => {
        if (ev.type === 'progress') {
          data.done    = ev.done
          data.total   = ev.total
          data.current = ev.name || ''
        } else if (ev.type === 'error') {
          task.errors.push(ev.message || ev.name || 'Error')
        } else if (ev.type === 'done') {
          task.status = task.errors.length ? 'error' : 'done'
          explorerState.invalidateTree()
          explorerState.refresh()
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
    openRename,
    openDelete,
    openMkdir,
    openTouch,
    doPaste,
  })
}
