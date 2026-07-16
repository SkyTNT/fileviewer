import { getActiveLayer } from '../editorState.js'
import { withSelectionClip } from '../selectionUtils.js'

let _drawing = false
let _lastX = 0, _lastY = 0

function eraseStamp(ctx, x, y, state) {
  const r = state.eraserSize / 2
  const hard = Math.max(0, Math.min(0.99, state.eraserHardness))
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(hard, 'rgba(0,0,0,1)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export default {
  id: 'eraser',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _drawing = true
    _lastX = e.x; _lastY = e.y
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      eraseStamp(ctx, e.x, e.y, state)
    }, true)
    toolCtx.invalidate()
  },

  onPointerMove(e, toolCtx) {
    if (!_drawing) return
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const dx = e.x - _lastX, dy = e.y - _lastY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const spacing = Math.max(1, state.eraserSize * 0.2)
    if (dist < spacing) return
    const steps = Math.floor(dist / spacing)
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      for (let i = 1; i <= steps; i++) {
        eraseStamp(ctx, _lastX + dx * i / steps, _lastY + dy * i / steps, state)
      }
    }, true)
    _lastX = _lastX + dx * steps / steps
    _lastY = _lastY + dy * steps / steps
    toolCtx.invalidate()
  },

  onPointerUp(e, toolCtx) {
    if (!_drawing) return
    _drawing = false
    toolCtx.pushHistory('Eraser')
  },

  renderOverlay(ctx, state) {
    if (!state.cursorInCanvas) return
    const { cursorX: x, cursorY: y, eraserSize, zoom } = state
    const r = eraserSize / 2
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
