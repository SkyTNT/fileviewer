import { getActiveLayer, hexToRgb } from '../editorState.js'

let _active = false
let _startX = 0, _startY = 0
let _curX = 0, _curY = 0

export default {
  id: 'shape',
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
    const x = Math.min(_startX, _curX), y = Math.min(_startY, _curY)
    const w = Math.abs(_curX - _startX), h = Math.abs(_curY - _startY)
    if (w < 2 && h < 2) return
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
    ctx.save()
    if (state.shapeFill) ctx.fillStyle = state.fgColor
    if (state.shapeStroke) { ctx.strokeStyle = state.fgColor; ctx.lineWidth = state.strokeWidth }
    ctx.beginPath()
    if (state.shapeType === 'rect') {
      ctx.rect(x, y, w, h)
    } else if (state.shapeType === 'ellipse') {
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2)
    } else if (state.shapeType === 'line') {
      ctx.moveTo(_startX, _startY); ctx.lineTo(_curX, _curY)
    }
    if (state.shapeFill && state.shapeType !== 'line') ctx.fill()
    if (state.shapeStroke) ctx.stroke()
    ctx.restore()
    pushHistory('Shape')
    state.isDirty = true
    invalidate()
  },

  renderOverlay(ctx, state) {
    if (!_active) return
    const x = Math.min(_startX, _curX), y = Math.min(_startY, _curY)
    const w = Math.abs(_curX - _startX), h = Math.abs(_curY - _startY)
    const z = state.zoom
    ctx.save()
    ctx.strokeStyle = state.fgColor
    ctx.lineWidth = (state.shapeStroke ? state.strokeWidth : 1) / z
    if (state.shapeFill) { ctx.fillStyle = state.fgColor; ctx.globalAlpha = 0.3 }
    ctx.beginPath()
    if (state.shapeType === 'rect') {
      ctx.rect(x, y, w, h)
    } else if (state.shapeType === 'ellipse') {
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2)
    } else if (state.shapeType === 'line') {
      ctx.moveTo(_startX, _startY); ctx.lineTo(_curX, _curY)
    }
    if (state.shapeFill && state.shapeType !== 'line') ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
    ctx.restore()
  },
}
