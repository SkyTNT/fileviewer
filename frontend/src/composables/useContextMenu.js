import { ref } from 'vue'
import { useFileStore } from '../stores/fileStore.js'

export function useContextMenu() {
  const store = useFileStore()

  const menuOpen   = ref(false)
  const menuX      = ref(0)
  const menuY      = ref(0)
  const menuTarget = ref(null)  // null = background, object = file

  function showMenu(x, y, file = null) {
    menuTarget.value = file
    menuX.value = Math.min(x, window.innerWidth - 220)
    menuY.value = Math.min(y, window.innerHeight - 320)
    menuOpen.value   = false
    setTimeout(() => { menuOpen.value = true }, 10)
  }

  function onBgContextMenu(e) {
    const canShow = store.writeMode && !store.isAtHome
    if (!canShow && !store.clipboard) return
    e.preventDefault()
    showMenu(e.clientX, e.clientY, null)
  }

  return { menuOpen, menuX, menuY, menuTarget, showMenu, onBgContextMenu }
}
