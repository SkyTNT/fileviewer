import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'
import { writeApi } from '../services/api.js'

/**
 * Shared write-mode actions: mkdir, touch, paste.
 * @param {(msg: string) => void} onError  - called on paste error
 */
export function useWriteActions(onError) {
  const store = useFileStore()

  // ── New Folder ───────────────────────────────────────────────────────────────
  const mkdirDialog  = ref(false)
  const mkdirName    = ref('')
  const mkdirLoading = ref(false)
  const mkdirError   = ref('')

  function openMkdir() {
    mkdirName.value  = ''
    mkdirError.value = ''
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

  // ── New File ─────────────────────────────────────────────────────────────────
  const touchDialog  = ref(false)
  const touchName    = ref('')
  const touchLoading = ref(false)
  const touchError   = ref('')

  function openTouch() {
    touchName.value  = ''
    touchError.value = ''
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

  // ── Paste ────────────────────────────────────────────────────────────────────
  const pasteLoading = ref(false)

  async function doPaste() {
    pasteLoading.value = true
    try {
      await store.paste()
    } catch (e) {
      onError?.(e.response?.data?.detail || e.message)
    } finally {
      pasteLoading.value = false
    }
  }

  return {
    mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
    touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
    pasteLoading, doPaste,
  }
}
