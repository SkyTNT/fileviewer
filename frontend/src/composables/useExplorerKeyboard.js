import { onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../stores/fileStore.js'

/**
 * Registers Ctrl+A/C/X/V keyboard shortcuts for the file explorer.
 * @param {() => Array} getEntries - returns the currently visible entries (for Ctrl+A)
 * @param {() => void}  doPaste    - called when Ctrl+V is pressed
 */
export function useExplorerKeyboard(getEntries, doPaste) {
  const store = useFileStore()

  function onKeyDown(e) {
    const el = document.activeElement
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
    if (el?.closest('[role="dialog"]')) return

    if (e.key === 'F5') {
      e.preventDefault()
      if (!store.isAtHome) store.refresh()
      store.invalidateTree()
      return
    }

    if (!e.ctrlKey && !e.metaKey) return

    switch (e.key) {
      case 'a':
        e.preventDefault()
        store.setSelection([...getEntries()])
        break
      case 'c':
        if (store.selectedEntries.length && !window.getSelection()?.toString()) {
          e.preventDefault()
          store.setCopy(store.selectedEntries)
        }
        break
      case 'x':
        if (store.writeMode && store.selectedEntries.length) {
          e.preventDefault()
          store.setCut(store.selectedEntries)
        }
        break
      case 'v':
        if (store.writeMode && store.clipboard && !store.isAtHome) {
          e.preventDefault()
          doPaste()
        }
        break
    }
  }

  onMounted(()   => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
