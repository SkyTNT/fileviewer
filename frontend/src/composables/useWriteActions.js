import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'
import { useNotificationStore } from '../stores/notificationStore.js'
import { writeApi } from '../services/api.js'
import { getErrorMessage } from '../utils/errors.js'

function createDialogState() {
  return { dialog: ref(false), name: ref(''), loading: ref(false), error: ref('') }
}

/**
 * All write-mode operations: rename, delete, mkdir, touch, paste.
 */
export function useWriteActions() {
  const { showError } = useNotificationStore()
  const store = useFileStore()

  // ── Rename ───────────────────────────────────────────────────────────────────
  const rename = createDialogState()
  const renameTarget  = ref(null)
  let _renameOnSuccess = null

  function openRename(file, onSuccess = null) {
    renameTarget.value    = file
    _renameOnSuccess      = onSuccess
    rename.name.value     = file?.name || ''
    rename.error.value    = ''
    rename.dialog.value   = true
  }

  async function confirmRename() {
    const newName = rename.name.value.trim()
    if (!newName || newName === renameTarget.value?.name) { rename.dialog.value = false; return }
    rename.loading.value = true
    rename.error.value   = ''
    try {
      await writeApi.rename(renameTarget.value.path, newName)
      rename.dialog.value = false
      store.invalidateTree()
      store.loadDirectory(store.currentPath)
      _renameOnSuccess?.()
    } catch (e) {
      rename.error.value = getErrorMessage(e)
    } finally {
      rename.loading.value = false
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteDialog  = ref(false)
  const deleteTargets = ref([])

  function openDelete(entries) {
    deleteTargets.value = Array.isArray(entries) ? entries : [entries]
    deleteDialog.value  = true
  }

  async function confirmDelete() {
    deleteDialog.value = false
    try {
      await store.deleteEntries(deleteTargets.value)
    } catch (e) {
      showError(getErrorMessage(e))
    }
  }

  // ── New Folder ────────────────────────────────────────────────────────────────
  const mkdir = createDialogState()

  function openMkdir() {
    mkdir.name.value   = ''
    mkdir.error.value  = ''
    mkdir.dialog.value = true
  }

  async function confirmMkdir() {
    const name = mkdir.name.value.trim()
    if (!name) return
    mkdir.loading.value = true
    mkdir.error.value   = ''
    try {
      await writeApi.mkdir(store.currentPath, name)
      mkdir.dialog.value = false
      store.invalidateTree()
      store.loadDirectory(store.currentPath)
    } catch (e) {
      mkdir.error.value = getErrorMessage(e)
    } finally {
      mkdir.loading.value = false
    }
  }

  // ── New File ──────────────────────────────────────────────────────────────────
  const touch = createDialogState()

  function openTouch() {
    touch.name.value   = ''
    touch.error.value  = ''
    touch.dialog.value = true
  }

  async function confirmTouch() {
    const name = touch.name.value.trim()
    if (!name) return
    touch.loading.value = true
    touch.error.value   = ''
    try {
      await writeApi.touch(store.currentPath, name)
      touch.dialog.value = false
      store.loadDirectory(store.currentPath)
    } catch (e) {
      touch.error.value = getErrorMessage(e)
    } finally {
      touch.loading.value = false
    }
  }

  // ── Paste ─────────────────────────────────────────────────────────────────────
  const pasteLoading = ref(false)

  async function doPaste() {
    pasteLoading.value = true
    try {
      await store.paste()
    } catch (e) {
      showError(getErrorMessage(e))
    } finally {
      pasteLoading.value = false
    }
  }

  return {
    // rename
    renameDialog: rename.dialog, renameTarget, renameName: rename.name,
    renameLoading: rename.loading, renameError: rename.error,
    openRename, confirmRename,
    // delete
    deleteDialog, deleteTargets, openDelete, confirmDelete,
    // mkdir
    mkdirDialog: mkdir.dialog, mkdirName: mkdir.name,
    mkdirLoading: mkdir.loading, mkdirError: mkdir.error,
    openMkdir, confirmMkdir,
    // touch
    touchDialog: touch.dialog, touchName: touch.name,
    touchLoading: touch.loading, touchError: touch.error,
    openTouch, confirmTouch,
    // paste
    pasteLoading, doPaste,
  }
}
