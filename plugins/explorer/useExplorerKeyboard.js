import { inject, onMounted, onUnmounted } from 'vue'

export function useExplorerKeyboard(allEntries = null) {
  const fileStore = inject('services').get('explorer.state')
  const winMgr    = inject('services').get('window.manager')
  const events     = inject('events')

  function getList() {
    if (!allEntries) return fileStore.entries
    if (typeof allEntries === 'function') return allEntries()
    return Array.isArray(allEntries) ? allEntries : (allEntries.value ?? fileStore.entries)
  }

  function handler({ key, ctrl, shift, meta, raw }) {
    if (winMgr?.hasVisibleWindow && key !== 'Escape' && !key?.startsWith('F')) return
    switch (key) {
      case 'F5':
        raw.preventDefault()
        if (!fileStore.isAtHome) fileStore.refresh()
        fileStore.invalidateTree()
        break
      case 'a':
        if (!ctrl && !meta) return
        raw.preventDefault()
        fileStore.setSelection([...getList()])
        break
      case 'd':
        if (!ctrl && !meta) return
        raw.preventDefault()
        { const sel = new Set(fileStore.selectedEntries.map(f => f.path))
          fileStore.setSelection(getList().filter(f => !sel.has(f.path))) }
        break
      case 'C':
        if ((!ctrl && !meta) || !shift) return
        if (fileStore.writeMode && fileStore.selectedEntries.length) {
          raw.preventDefault()
          fileStore.setCopyLink(fileStore.selectedEntries)
        }
        break
      case 'ArrowLeft':
        if (fileStore.selectedEntries.length !== 1) return
        raw.preventDefault()
        { const list = getList()
          const idx = list.findIndex(f => f.path === fileStore.selectedEntries[0].path)
          if (idx > 0) fileStore.selectEntry(list[idx - 1]) }
        break
      case 'ArrowRight':
        if (fileStore.selectedEntries.length !== 1) return
        raw.preventDefault()
        { const list = getList()
          const idx = list.findIndex(f => f.path === fileStore.selectedEntries[0].path)
          if (idx !== -1 && idx < list.length - 1) fileStore.selectEntry(list[idx + 1]) }
        break
    }
  }

  onMounted(()   => events?.on('keyboard:keydown', handler, 'explorer'))
  onUnmounted(() => events?.off('keyboard:keydown', handler))
}
