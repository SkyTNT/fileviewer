import { onMounted, onUnmounted } from 'vue'
import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'

/**
 * Registers Ctrl+A/C/X/V/F5 keyboard shortcuts for the file explorer.
 * @param {() => Array} getEntries - returns the currently visible entries (for Ctrl+A).
 *   Needed because WaterfallView maintains a local infinite-scroll buffer that
 *   differs from store.entries (which only holds the current page).
 */
export function useExplorerKeyboard(getEntries) {
  const fileStore  = useFileStore()
  const writeStore = useWriteStore()

  function onKeyDown(e) {
    const el = document.activeElement
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
    if (el?.closest('[role="dialog"]')) return

    if (e.key === 'F5') {
      e.preventDefault()
      if (!fileStore.isAtHome) fileStore.refresh()
      fileStore.invalidateTree()
      return
    }

    if (!e.ctrlKey && !e.metaKey) return

    switch (e.key) {
      case 'a':
        e.preventDefault()
        fileStore.setSelection([...getEntries()])
        break
      case 'c':
        if (fileStore.selectedEntries.length && !window.getSelection()?.toString()) {
          e.preventDefault()
          fileStore.setCopy(fileStore.selectedEntries)
        }
        break
      case 'x':
        if (fileStore.writeMode && fileStore.selectedEntries.length) {
          e.preventDefault()
          fileStore.setCut(fileStore.selectedEntries)
        }
        break
      case 'v':
        if (fileStore.writeMode && fileStore.clipboard && !fileStore.isAtHome) {
          e.preventDefault()
          writeStore.doPaste()
        }
        break
    }
  }

  onMounted(()   => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
