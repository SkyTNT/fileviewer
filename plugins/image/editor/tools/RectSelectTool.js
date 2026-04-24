let _active = false
let _startX = 0, _startY = 0

function updateSelection(state, x, y) {
  const bx = Math.min(_startX, x), by = Math.min(_startY, y)
  const bw = Math.abs(x - _startX), bh = Math.abs(y - _startY)
  applySelectionOp(state, { type: 'rect', bounds: { x: bx, y: by, w: bw, h: bh }, points: null })
}

function applySelectionOp(state, sel) {
  const mode = state.selectionMode
  if (mode === 'replace' || !state.selection) {
    state.selection = sel
    return
  }
  if (!state.selection) { state.selection = sel; return }
  // For simplicity, union/subtract on bounding boxes
  const a = state.selection.bounds, b = sel.bounds
  if (mode === 'add') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    const rx = Math.max(a.x + a.w, b.x + b.w), ry = Math.max(a.y + a.h, b.y + b.h)
    state.selection = { type: 'rect', bounds: { x, y, w: rx - x, h: ry - y }, points: null }
  } else if (mode === 'subtract') {
    // Simple: clear selection if overlapping
    state.selection = null
  }
}

export default {
  id: 'rect-select',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _startX = e.x; _startY = e.y
    if (toolCtx.state.selectionMode === 'replace') toolCtx.state.selection = null
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    updateSelection(toolCtx.state, e.x, e.y)
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    updateSelection(toolCtx.state, e.x, e.y)
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
    ctx.fillRect(x, y, w, h)
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  },
}
