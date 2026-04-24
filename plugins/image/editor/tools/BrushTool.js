import { getActiveLayer, hexToRgb } from '../editorState.js'
import { withSelectionClip } from '../selectionUtils.js'

let _drawing = false
let _lastX = 0, _lastY = 0

function drawStamp(ctx, x, y, state, composite = 'source-over') {
  const r = state.brushSize / 2
  const alpha = state.brushFlow * state.brushOpacity
  const { r: cr, g: cg, b: cb } = hexToRgb(state.fgColor)
  ctx.save()
  ctx.globalCompositeOperation = composite
  ctx.globalAlpha = alpha
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
  const hard = Math.max(0, Math.min(0.99, state.brushHardness))
  grad.addColorStop(0, `rgb(${cr},${cg},${cb})`)
  grad.addColorStop(hard, `rgb(${cr},${cg},${cb})`)
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function stroke(x, y, state, toolCtx, composite = 'source-over') {
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  const dx = x - _lastX, dy = y - _lastY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const spacing = Math.max(1, state.brushSize * 0.2)
  if (dist < spacing) return
  const steps = Math.floor(dist / spacing)
  const layerCtx = layer.canvas.getContext('2d')
  withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
    for (let i = 1; i <= steps; i++) {
      drawStamp(ctx, _lastX + dx * i / steps, _lastY + dy * i / steps, state, composite)
    }
  })
  _lastX = _lastX + dx * steps / steps
  _lastY = _lastY + dy * steps / steps
  toolCtx.invalidate()
}

export default {
  id: 'brush',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _drawing = true
    _lastX = e.x; _lastY = e.y
    const layerCtx = layer.canvas.getContext('2d')
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      drawStamp(ctx, e.x, e.y, state)
    })
    toolCtx.invalidate()
  },

  onPointerMove(e, toolCtx) {
    if (!_drawing) return
    stroke(e.x, e.y, toolCtx.state, toolCtx)
  },

  onPointerUp(e, toolCtx) {
    if (!_drawing) return
    _drawing = false
    toolCtx.pushHistory('Brush')
  },

  renderOverlay(ctx, state) {
    if (!state.cursorInCanvas) return
    const { cursorX: x, cursorY: y, brushSize, zoom } = state
    const r = brushSize / 2
    ctx.save()
    ctx.lineWidth = 1 / zoom
    ctx.strokeStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#000000'
    ctx.setLineDash([2 / zoom, 2 / zoom])
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  },
}
