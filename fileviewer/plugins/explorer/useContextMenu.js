import { ref, watch, inject } from 'vue'

export function useContextMenu() {
  const store = inject('services').get('explorer.state')

  const menuOpen = ref(false)
  const menuX    = ref(0)
  const menuY    = ref(0)
  let reopening  = false

  function showMenu(x, y, file = null) {
    store.setContextMenuFile(file)
    menuX.value    = x
    menuY.value    = y
    reopening      = true
    menuOpen.value = false
    setTimeout(() => { reopening = false; menuOpen.value = true }, 10)
  }

  watch(menuOpen, (open) => {
    if (!open && !reopening) store.setContextMenuFile(null)
  })

  function onBgContextMenu(e) {
    if (e.target.closest('.file-card')) return
    const canShow = store.writeMode && !store.isAtHome
    if (!canShow && !store.clipboard) return
    e.preventDefault()
    showMenu(e.clientX, e.clientY, null)
  }

  return { menuOpen, menuX, menuY, showMenu, onBgContextMenu }
}
