import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'
import { useNotificationStore } from '../stores/notificationStore.js'
import { writeApi } from '../services/api.js'
import { getErrorMessage } from '../utils/errors.js'

// ── Module-level singletons ────────────────────────────────────────────────────
// All callers of useWriteActions() share the same dialog state, so dialogs only
// need to be mounted once (in App.vue).

function _dialogState() {
  return { dialog: ref(false), name: ref(''), loading: ref(false), error: ref('') }
}

const _rename      = _dialogState()
const _renameTarget = ref(null)
let   _renameOnSuccess = null

const _deleteDialog  = ref(false)
const _deleteTargets = ref([])

const _mkdir = _dialogState()
const _touch = _dialogState()

// ─────────────────────────────────────────────────────────────────────────────

export function useWriteActions() {
  const store = useFileStore()
  const { showError } = useNotificationStore()

  // ── Rename ─────────────────────────────────────────────────────────────────
  function openRename(file, onSuccess = null) {
    _renameTarget.value  = file
    _renameOnSuccess     = onSuccess
    _rename.name.value   = file?.name || ''
    _rename.error.value  = ''
    _rename.dialog.value = true
  }

  async function confirmRename() {
    const newName = _rename.name.value.trim()
    if (!newName || newName === _renameTarget.value?.name) { _rename.dialog.value = false; return }
    _rename.loading.value = true
    _rename.error.value   = ''
    try {
      await writeApi.rename(_renameTarget.value.path, newName)
      _rename.dialog.value = false
      store.invalidateTree()
      store.refresh()
      _renameOnSuccess?.()
    } catch (e) {
      _rename.error.value = getErrorMessage(e)
    } finally {
      _rename.loading.value = false
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function openDelete(entries) {
    _deleteTargets.value = Array.isArray(entries) ? entries : [entries]
    _deleteDialog.value  = true
  }

  async function confirmDelete() {
    _deleteDialog.value = false
    try {
      await store.deleteEntries(_deleteTargets.value)
    } catch (e) {
      showError(getErrorMessage(e))
    }
  }

  // ── New Folder ─────────────────────────────────────────────────────────────
  function openMkdir() {
    _mkdir.name.value   = ''
    _mkdir.error.value  = ''
    _mkdir.dialog.value = true
  }

  async function confirmMkdir() {
    const name = _mkdir.name.value.trim()
    if (!name) return
    _mkdir.loading.value = true
    _mkdir.error.value   = ''
    try {
      await writeApi.mkdir(store.currentPath, name)
      _mkdir.dialog.value = false
      store.invalidateTree()
      store.refresh()
    } catch (e) {
      _mkdir.error.value = getErrorMessage(e)
    } finally {
      _mkdir.loading.value = false
    }
  }

  // ── New File ───────────────────────────────────────────────────────────────
  function openTouch() {
    _touch.name.value   = ''
    _touch.error.value  = ''
    _touch.dialog.value = true
  }

  async function confirmTouch() {
    const name = _touch.name.value.trim()
    if (!name) return
    _touch.loading.value = true
    _touch.error.value   = ''
    try {
      await writeApi.touch(store.currentPath, name)
      _touch.dialog.value = false
      store.refresh()
    } catch (e) {
      _touch.error.value = getErrorMessage(e)
    } finally {
      _touch.loading.value = false
    }
  }

  // ── Paste ──────────────────────────────────────────────────────────────────
  async function doPaste() {
    try {
      await store.paste()
    } catch (e) {
      showError(getErrorMessage(e))
    }
  }

  return {
    // rename
    renameDialog: _rename.dialog, renameName: _rename.name,
    renameLoading: _rename.loading, renameError: _rename.error,
    openRename, confirmRename,
    // delete
    deleteDialog: _deleteDialog, deleteTargets: _deleteTargets,
    openDelete, confirmDelete,
    // mkdir
    mkdirDialog: _mkdir.dialog, mkdirName: _mkdir.name,
    mkdirLoading: _mkdir.loading, mkdirError: _mkdir.error,
    openMkdir, confirmMkdir,
    // touch
    touchDialog: _touch.dialog, touchName: _touch.name,
    touchLoading: _touch.loading, touchError: _touch.error,
    openTouch, confirmTouch,
    // paste
    doPaste,
  }
}
