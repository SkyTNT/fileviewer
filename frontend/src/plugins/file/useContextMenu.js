import { ref, watch } from 'vue'
import { useFileStore } from '@/plugins/file/store.js'

export function useContextMenu() {
  const store = useFileStore()

  const menuOpen = ref(false)
  const menuX    = ref(0)
  const menuY    = ref(0)

  function showMenu(x, y, file = null) {
    store.setContextMenuFile(file)
    menuX.value    = x
    menuY.value    = y
    menuOpen.value   = false
    setTimeout(() => { menuOpen.value = true }, 10)
  }

  watch(menuOpen, (open) => {
    if (!open) store.setContextMenuFile(null)
  })

  function onBgContextMenu(e) {
    const canShow = store.writeMode && !store.isAtHome
    if (!canShow && !store.clipboard) return
    e.preventDefault()
    showMenu(e.clientX, e.clientY, null)
  }

  return { menuOpen, menuX, menuY, showMenu, onBgContextMenu }
}
