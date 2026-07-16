import { mergeSelection } from '../selectionUtils.js'

let _active = false
let _points = []
let _prevSelection = null

export default {
  id: 'lasso',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _points = [{ x: e.x, y: e.y }]
    _prevSelection = toolCtx.state.selectionMode !== 'replace' ? toolCtx.state.selection : null
    if (toolCtx.state.selectionMode === 'replace') toolCtx.state.selection = null
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    _points.push({ x: e.x, y: e.y })
    // Don't compute mask during drag — just keep points for overlay
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    if (_points.length < 3) { toolCtx.state.selection = _prevSelection ?? null; _prevSelection = null; return }
    const xs = _points.map(p => p.x), ys = _points.map(p => p.y)
    const newSel = {
      type: 'lasso',
      points: [..._points],
      bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      mask: null,
    }
    toolCtx.state.selection = mergeSelection(_prevSelection, newSel, toolCtx.state.selectionMode, toolCtx.state.canvasWidth, toolCtx.state.canvasHeight)
    _prevSelection = null
  },

  renderOverlay(ctx, state) {
    if (!_active || !_points.length) return
    ctx.save()
    ctx.strokeStyle = 'rgba(0,120,215,0.9)'
    ctx.lineWidth = 1 / state.zoom
    ctx.beginPath()
    ctx.moveTo(_points[0].x, _points[0].y)
    for (let i = 1; i < _points.length; i++) ctx.lineTo(_points[i].x, _points[i].y)
    ctx.stroke()
    ctx.restore()
  },
}
