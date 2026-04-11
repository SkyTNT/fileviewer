import { ref, reactive, readonly } from 'vue'

export function useRubberBand(containerRef, onSelect) {
  const isDragging = ref(false)
  const selRect    = reactive({ left: 0, top: 0, width: 0, height: 0 })

  let startX = 0, startY = 0, startedOnItem = false, ctrlHeld = false

  function updateRect(clientX, clientY) {
    selRect.left   = Math.min(startX, clientX)
    selRect.top    = Math.min(startY, clientY)
    selRect.width  = Math.abs(clientX - startX)
    selRect.height = Math.abs(clientY - startY)
  }

  function hitTest() {
    const el = containerRef.value
    if (!el) return []
    const sr = {
      left:   selRect.left,
      right:  selRect.left + selRect.width,
      top:    selRect.top,
      bottom: selRect.top + selRect.height,
    }
    const paths = []
    el.querySelectorAll('[data-path]').forEach(item => {
      const r = item.getBoundingClientRect()
      if (r.right >= sr.left && r.left <= sr.right &&
          r.bottom >= sr.top  && r.top  <= sr.bottom) {
        paths.push(item.dataset.path)
      }
    })
    return paths
  }

  function onMouseMove(e) {
    const dx = Math.abs(e.clientX - startX)
    const dy = Math.abs(e.clientY - startY)
    if (!isDragging.value) {
      if (dx < 4 && dy < 4) return
      isDragging.value = true
      document.body.style.userSelect = 'none'
    }
    updateRect(e.clientX, e.clientY)
    onSelect(hitTest(), ctrlHeld)
  }

  function onMouseUp() {
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)
    if (!isDragging.value && !startedOnItem) onSelect([], ctrlHeld)
    isDragging.value = false
  }

  function onMouseDown(e) {
    if (e.button !== 0) return
    // Let native controls (pagination, buttons, links) handle their own clicks
    if (e.target.closest('button, a, input, select, [role="button"]')) return
    e.preventDefault()
    startedOnItem = !!e.target.closest('[data-path]')
    ctrlHeld = e.ctrlKey || e.metaKey
    startX = e.clientX
    startY = e.clientY
    updateRect(startX, startY)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  return { isDragging, selRect: readonly(selRect), onMouseDown }
}
