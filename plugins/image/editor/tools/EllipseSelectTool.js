let _active = false
let _startX = 0, _startY = 0

export default {
  id: 'ellipse-select',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _startX = e.x; _startY = e.y
    if (toolCtx.state.selectionMode === 'replace') toolCtx.state.selection = null
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    const bx = Math.min(_startX, e.x), by = Math.min(_startY, e.y)
    toolCtx.state.selection = {
      type: 'ellipse',
      bounds: { x: bx, y: by, w: Math.abs(e.x - _startX), h: Math.abs(e.y - _startY) },
      points: null,
    }
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    const sel = toolCtx.state.selection
    if (sel && sel.bounds.w < 2 && sel.bounds.h < 2) toolCtx.state.selection = null
  },

  renderOverlay(ctx, state) {
    if (!_active || !state.selection) return
    const { x, y, w, h } = state.selection.bounds
    const z = state.zoom
    ctx.save()
    ctx.strokeStyle = 'rgba(0,120,215,0.9)'
    ctx.fillStyle = 'rgba(0,120,215,0.1)'
    ctx.lineWidth = 1 / z
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  },
}
