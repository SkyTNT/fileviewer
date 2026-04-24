import { mergeSelection } from '../selectionUtils.js'

let _active = false
let _startX = 0, _startY = 0
let _curX = 0, _curY = 0
let _prevSelection = null

function currentBounds() {
  return {
    x: Math.min(_startX, _curX), y: Math.min(_startY, _curY),
    w: Math.abs(_curX - _startX), h: Math.abs(_curY - _startY),
  }
}

export default {
  id: 'ellipse-select',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _startX = _curX = e.x; _startY = _curY = e.y
    _prevSelection = toolCtx.state.selectionMode !== 'replace' ? toolCtx.state.selection : null
    if (toolCtx.state.selectionMode === 'replace') toolCtx.state.selection = null
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    _curX = e.x; _curY = e.y
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    _curX = e.x; _curY = e.y
    const b = currentBounds()
    if (b.w < 2 || b.h < 2) { toolCtx.state.selection = _prevSelection ?? null; _prevSelection = null; return }
    const newSel = { type: 'ellipse', bounds: b, points: null }
    toolCtx.state.selection = mergeSelection(_prevSelection, newSel, toolCtx.state.selectionMode, toolCtx.state.canvasWidth, toolCtx.state.canvasHeight)
    _prevSelection = null
  },

  renderOverlay(ctx, state) {
    if (!_active) return
    const b = currentBounds()
    const z = state.zoom
    ctx.save()
    ctx.strokeStyle = 'rgba(0,120,215,0.9)'
    ctx.fillStyle = 'rgba(0,120,215,0.1)'
    ctx.lineWidth = 1 / z
    ctx.beginPath()
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  },
}
