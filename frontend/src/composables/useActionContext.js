import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../stores/fileStore.js'
import { useNotificationStore } from '../stores/notificationStore.js'
import { useWriteActions } from './useWriteActions.js'
import { useArchiveActions } from './useArchiveActions.js'
import { useCopyToClipboard } from './useCopyToClipboard.js'

// ── Shared action context ──────────────────────────────────────────────────────
//
// All composables called here use module-level singleton state, so multiple
// components calling useActionContext() share the same underlying refs.
//
// Usage:
//
//   // In any component setup():
//   const { baseCtx, singleCtx, multiCtx } = useActionContext()
//
//   // ContextMenu: spread baseCtx and add file / isTarget
//   const ctx = { ...baseCtx.value, file, isTarget, isMulti, selection, copyToClipboard }
//
//   // FileDetail: use singleCtx / multiCtx directly
//   resolveDetailActions(singleCtx.value, 'single')
//   resolveDetailActions(multiCtx.value,  'multi')

export function useActionContext() {
  const store = useFileStore()
  const { t } = useI18n()
  const { showError, showSuccess } = useNotificationStore()

  const { openRename, openDelete, openMkdir, openTouch, doPaste } = useWriteActions()
  const { openCompress, extractHere, extractToSubfolder } = useArchiveActions()
  const { copyLoading, copyToClipboard } = useCopyToClipboard()

  const canWrite = computed(() => store.writeMode && store.currentPath !== '')

  // Invariant fields shared by every surface
  const baseCtx = computed(() => ({
    store,
    t,
    canWrite: canWrite.value,
    showError,
    showSuccess,
    openRename,
    openDelete,
    openCompress,
    extractHere,
    extractToSubfolder,
    openMkdir,
    openTouch,
    doPaste,
    copyLoading: copyLoading.value,
  }))

  // FileDetail — single-select
  const singleCtx = computed(() => ({
    ...baseCtx.value,
    file: store.selectedEntry,
    selection: store.selectedEntry ? [store.selectedEntry] : [],
    isTarget: false,
    isMulti: false,
    copyToClipboard: () => copyToClipboard(store.selectedEntry),
  }))

  // FileDetail — multi-select
  const multiCtx = computed(() => ({
    ...baseCtx.value,
    file: null,
    selection: store.selectedEntries,
    isTarget: false,
    isMulti: true,
    copyToClipboard: undefined,
  }))

  return { baseCtx, singleCtx, multiCtx, copyToClipboard }
}
