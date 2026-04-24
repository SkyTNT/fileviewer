let _active = false
let _points = []

export default {
  id: 'lasso',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _points = [{ x: e.x, y: e.y }]
    if (toolCtx.state.selectionMode === 'replace') toolCtx.state.selection = null
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    _points.push({ x: e.x, y: e.y })
    const xs = _points.map(p => p.x), ys = _points.map(p => p.y)
    toolCtx.state.selection = {
      type: 'lasso',
      points: [..._points],
      bounds: {
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      },
      mask: null,
    }
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    if (_points.length < 3) toolCtx.state.selection = null
  },

  renderOverlay(ctx, state) {
    if (!_active || !state.selection?.points?.length) return
    const pts = state.selection.points
    ctx.save()
    ctx.strokeStyle = 'rgba(0,120,215,0.9)'
    ctx.lineWidth = 1 / state.zoom
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    ctx.restore()
  },
}
