import { useFileStore } from '@/plugins/file/store.js'
import { useWriteStore } from '@/plugins/write/store.js'
import { useKeyboard } from '@/plugins/keyboard/useKeyboard.js'

export function useExplorerKeyboard(allEntries = null) {
  const fileStore  = useFileStore()
  const writeStore = useWriteStore()

  function getList() {
    if (!allEntries) return fileStore.entries
    if (typeof allEntries === 'function') return allEntries()
    return Array.isArray(allEntries) ? allEntries : (allEntries.value ?? fileStore.entries)
  }

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
      fileStore.setSelection([...getList()])
    },
    'c': (e) => {
      if (!e.ctrlKey && !e.metaKey) return false
      if (fileStore.selectedEntries.length && !window.getSelection()?.toString()) {
        e.preventDefault()
        fileStore.setCopy(fileStore.selectedEntries)
      }
    },
    'C': (e) => {
      if (!e.ctrlKey && !e.metaKey || !e.shiftKey) return false
      if (fileStore.writeMode && fileStore.selectedEntries.length) {
        e.preventDefault()
        fileStore.setCopyLink(fileStore.selectedEntries)
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
    'ArrowLeft': (e) => {
      if (fileStore.selectedEntries.length !== 1) return false
      e.preventDefault()
      const list = getList()
      const idx = list.findIndex(f => f.path === fileStore.selectedEntries[0].path)
      if (idx > 0) fileStore.selectEntry(list[idx - 1])
    },
    'ArrowRight': (e) => {
      if (fileStore.selectedEntries.length !== 1) return false
      e.preventDefault()
      const list = getList()
      const idx = list.findIndex(f => f.path === fileStore.selectedEntries[0].path)
      if (idx !== -1 && idx < list.length - 1) fileStore.selectEntry(list[idx + 1])
    },
  })
}
