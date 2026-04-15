import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'
import { useKeyboard } from '@/plugins/keyboard/useKeyboard.js'

/**
 * Registers Ctrl+A/C/X/V/F5 keyboard shortcuts for the file explorer.
 * @param {() => Array} getEntries - returns the currently visible entries (for Ctrl+A).
 *   Needed because WaterfallView maintains a local infinite-scroll buffer that
 *   differs from store.entries (which only holds the current page).
 */
export function useExplorerKeyboard(getEntries) {
  const fileStore  = useFileStore()
  const writeStore = useWriteStore()

  useKeyboard({
    'Delete': (e) => {
      if (!fileStore.writeMode || !fileStore.selectedEntries.length || fileStore.isAtHome) return false
      e.preventDefault()
      writeStore.openDelete(fileStore.selectedEntries)
    },
    'F5': (e) => {
      e.preventDefault()
      if (!fileStore.isAtHome) fileStore.refresh()
      fileStore.invalidateTree()
    },
    'a': (e) => {
      if (!e.ctrlKey && !e.metaKey) return false
      e.preventDefault()
      fileStore.setSelection([...getEntries()])
    },
    'c': (e) => {
      if (!e.ctrlKey && !e.metaKey) return false
      if (fileStore.selectedEntries.length && !window.getSelection()?.toString()) {
        e.preventDefault()
        fileStore.setCopy(fileStore.selectedEntries)
      }
    },
    'x': (e) => {
      if (!e.ctrlKey && !e.metaKey) return false
      if (fileStore.writeMode && fileStore.selectedEntries.length) {
        e.preventDefault()
        fileStore.setCut(fileStore.selectedEntries)
      }
    },
    'v': (e) => {
      if (!e.ctrlKey && !e.metaKey) return false
      if (fileStore.writeMode && fileStore.clipboard && !fileStore.isAtHome) {
        e.preventDefault()
        writeStore.doPaste()
      }
    },
  })
}
