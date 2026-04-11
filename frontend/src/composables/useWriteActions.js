import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'
import { useNotification } from './useNotification.js'
import { writeApi } from '../services/api.js'

/**
 * All write-mode operations: rename, delete, mkdir, touch, paste.
 */
export function useWriteActions() {
  const { showError } = useNotification()
  const store = useFileStore()

  // ── Rename ───────────────────────────────────────────────────────────────────
  const renameDialog  = ref(false)
  const renameTarget  = ref(null)
  const renameName    = ref('')
  const renameLoading = ref(false)
  const renameError   = ref('')
  let _renameOnSuccess = null

  function openRename(file, onSuccess = null) {
    renameTarget.value  = file
    _renameOnSuccess    = onSuccess
    renameName.value    = file?.name || ''
    renameError.value   = ''
    renameDialog.value  = true
  }

  async function confirmRename() {
    const newName = renameName.value.trim()
    if (!newName || newName === renameTarget.value?.name) { renameDialog.value = false; return }
    renameLoading.value = true
    renameError.value   = ''
    try {
      await writeApi.rename(renameTarget.value.path, newName)
      renameDialog.value = false
      store.invalidateTree()
      store.loadDirectory(store.currentPath)
      _renameOnSuccess?.()
    } catch (e) {
      renameError.value = e.response?.data?.detail || e.message
    } finally {
      renameLoading.value = false
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
      showError(e.response?.data?.detail || e.message)
    }
  }

  // ── New Folder ────────────────────────────────────────────────────────────────
  const mkdirDialog  = ref(false)
  const mkdirName    = ref('')
  const mkdirLoading = ref(false)
  const mkdirError   = ref('')

  function openMkdir() {
    mkdirName.value   = ''
    mkdirError.value  = ''
    mkdirDialog.value = true
  }

  async function confirmMkdir() {
    const name = mkdirName.value.trim()
    if (!name) return
    mkdirLoading.value = true
    mkdirError.value   = ''
    try {
      await writeApi.mkdir(store.currentPath, name)
      mkdirDialog.value = false
      store.invalidateTree()
      store.loadDirectory(store.currentPath)
    } catch (e) {
      mkdirError.value = e.response?.data?.detail || e.message
    } finally {
      mkdirLoading.value = false
    }
  }

  // ── New File ──────────────────────────────────────────────────────────────────
  const touchDialog  = ref(false)
  const touchName    = ref('')
  const touchLoading = ref(false)
  const touchError   = ref('')

  function openTouch() {
    touchName.value   = ''
    touchError.value  = ''
    touchDialog.value = true
  }

  async function confirmTouch() {
    const name = touchName.value.trim()
    if (!name) return
    touchLoading.value = true
    touchError.value   = ''
    try {
      await writeApi.touch(store.currentPath, name)
      touchDialog.value = false
      store.loadDirectory(store.currentPath)
    } catch (e) {
      touchError.value = e.response?.data?.detail || e.message
    } finally {
      touchLoading.value = false
    }
  }

  // ── Paste ─────────────────────────────────────────────────────────────────────
  const pasteLoading = ref(false)

  async function doPaste() {
    pasteLoading.value = true
    try {
      await store.paste()
    } catch (e) {
      showError(e.response?.data?.detail || e.message)
    } finally {
      pasteLoading.value = false
    }
  }

  return {
    // rename
    renameDialog, renameTarget, renameName, renameLoading, renameError,
    openRename, confirmRename,
    // delete
    deleteDialog, deleteTargets, openDelete, confirmDelete,
    // mkdir
    mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
    // touch
    touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
    // paste
    pasteLoading, doPaste,
  }
}
