import { defineStore } from 'pinia'
import { ref } from 'vue'
import { writeApi } from '@/services/api.js'
import { getErrorMessage } from '@/utils/errors.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useNotificationStore } from '@/plugins/notification/store.js'

export const useWriteStore = defineStore('write', () => {
  // ── Dialog state ─────────────────────────────────────────────────────────────
  const rename = ref({ dialog: false, name: '', loading: false, error: '', target: null, onSuccess: null })
  const del    = ref({ dialog: false, targets: [] })
  const mkdir  = ref({ dialog: false, name: '', loading: false, error: '' })
  const touch  = ref({ dialog: false, name: '', loading: false, error: '' })

  // ── Rename ────────────────────────────────────────────────────────────────────
  function openRename(file, onSuccess = null) {
    rename.value = { dialog: true, name: file?.name || '', loading: false, error: '', target: file, onSuccess }
  }

  async function confirmRename() {
    const fileStore = useFileStore()
    const newName   = rename.value.name.trim()
    if (!newName || newName === rename.value.target?.name) { rename.value.dialog = false; return }
    rename.value.loading = true
    rename.value.error   = ''
    try {
      await writeApi.rename(rename.value.target.path, newName)
      rename.value.dialog = false
      fileStore.invalidateTree()
      fileStore.refresh()
      rename.value.onSuccess?.()
    } catch (e) {
      rename.value.error = getErrorMessage(e)
    } finally {
      rename.value.loading = false
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  function openDelete(entries) {
    del.value = { dialog: true, targets: Array.isArray(entries) ? entries : [entries] }
  }

  async function confirmDelete() {
    const fileStore = useFileStore()
    const { showError } = useNotificationStore()
    del.value.dialog = false
    try {
      await fileStore.deleteEntries(del.value.targets)
    } catch (e) {
      showError(getErrorMessage(e))
    }
  }

  // ── New Folder ────────────────────────────────────────────────────────────────
  function openMkdir() {
    mkdir.value = { dialog: true, name: '', loading: false, error: '' }
  }

  async function confirmMkdir() {
    const fileStore = useFileStore()
    const name = mkdir.value.name.trim()
    if (!name) return
    mkdir.value.loading = true
    mkdir.value.error   = ''
    try {
      await writeApi.mkdir(fileStore.currentPath, name)
      mkdir.value.dialog = false
      fileStore.invalidateTree()
      fileStore.refresh()
    } catch (e) {
      mkdir.value.error = getErrorMessage(e)
    } finally {
      mkdir.value.loading = false
    }
  }

  // ── New File ──────────────────────────────────────────────────────────────────
  function openTouch() {
    touch.value = { dialog: true, name: '', loading: false, error: '' }
  }

  async function confirmTouch() {
    const fileStore = useFileStore()
    const name = touch.value.name.trim()
    if (!name) return
    touch.value.loading = true
    touch.value.error   = ''
    try {
      await writeApi.touch(fileStore.currentPath, name)
      touch.value.dialog = false
      fileStore.refresh()
    } catch (e) {
      touch.value.error = getErrorMessage(e)
    } finally {
      touch.value.loading = false
    }
  }

  // ── Paste ─────────────────────────────────────────────────────────────────────
  async function doPaste() {
    const fileStore = useFileStore()
    const { showError } = useNotificationStore()
    try {
      await fileStore.paste()
    } catch (e) {
      showError(getErrorMessage(e))
    }
  }

  return {
    rename, del, mkdir, touch,
    openRename, confirmRename,
    openDelete, confirmDelete,
    openMkdir, confirmMkdir,
    openTouch, confirmTouch,
    doPaste,
  }
})
