import { getActiveLayer } from '../editorState.js'
import { withSelectionClip } from '../selectionUtils.js'

let _active = false
let _startX = 0, _startY = 0
let _curX = 0, _curY = 0

export default {
  id: 'gradient',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    _active = true
    _startX = e.x; _startY = e.y
    _curX = e.x; _curY = e.y
  },

  onPointerMove(e, toolCtx) {
    if (!_active) return
    _curX = e.x; _curY = e.y
  },

  onPointerUp(e, toolCtx) {
    if (!_active) return
    _active = false
    const { state, pushHistory, invalidate } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const { fgColor, bgColor, gradientType } = state
    const layerCtx = layer.canvas.getContext('2d')
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      let grad
      if (gradientType === 'linear') {
        grad = ctx.createLinearGradient(_startX, _startY, _curX, _curY)
      } else {
        const r = Math.sqrt((_curX - _startX) ** 2 + (_curY - _startY) ** 2)
        grad = ctx.createRadialGradient(_startX, _startY, 0, _startX, _startY, r)
      }
      grad.addColorStop(0, fgColor)
      grad.addColorStop(1, bgColor)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height)
    })
    pushHistory('Gradient')
    state.isDirty = true
    invalidate()
  },

  renderOverlay(ctx, state) {
    if (!_active) return
    const z = state.zoom
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1 / z
    ctx.setLineDash([4 / z, 4 / z])
    ctx.beginPath()
    ctx.moveTo(_startX, _startY)
    ctx.lineTo(_curX, _curY)
    ctx.stroke()
    ctx.fillStyle = state.fgColor
    ctx.beginPath(); ctx.arc(_startX, _startY, 4 / z, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = state.bgColor
    ctx.beginPath(); ctx.arc(_curX, _curY, 4 / z, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  },
}
