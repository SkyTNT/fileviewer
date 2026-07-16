import { ref } from 'vue'

export function createViewport(state) {
  const containerRef = ref(null)

  function getCenter() {
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return { cx: 0, cy: 0 }
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }

  // Convert screen (clientX/Y) → canvas pixel coords
  function screenToCanvas(sx, sy) {
    const { cx, cy } = getCenter()
    return {
      x: (sx - cx - state.panX) / state.zoom + state.canvasWidth / 2,
      y: (sy - cy - state.panY) / state.zoom + state.canvasHeight / 2,
    }
  }

  // Convert canvas pixel coords → screen (clientX/Y)
  function canvasToScreen(cx_c, cy_c) {
    const { cx, cy } = getCenter()
    return {
      x: (cx_c - state.canvasWidth / 2) * state.zoom + state.panX + cx,
      y: (cy_c - state.canvasHeight / 2) * state.zoom + state.panY + cy,
    }
  }

  function fitToWindow() {
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect || !state.canvasWidth || !state.canvasHeight) return
    const zx = (rect.width - 40) / state.canvasWidth
    const zy = (rect.height - 40) / state.canvasHeight
    state.zoom = Math.min(zx, zy)
    state.panX = 0
    state.panY = 0
  }

  function zoomAt(sx, sy, factor) {
    const { cx, cy } = getCenter()
    const newZoom = Math.max(0.02, Math.min(32, state.zoom * factor))
    const ratio = newZoom / state.zoom
    state.panX = sx - cx - (sx - cx - state.panX) * ratio
    state.panY = sy - cy - (sy - cy - state.panY) * ratio
    state.zoom = newZoom
  }

  function setZoom(newZoom) {
    state.zoom = Math.max(0.02, Math.min(32, newZoom))
  }

  return { containerRef, screenToCanvas, canvasToScreen, fitToWindow, zoomAt, setZoom }
}
