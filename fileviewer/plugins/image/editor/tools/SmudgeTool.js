import { getActiveLayer } from '../editorState.js'
import { withSelectionClip } from '../selectionUtils.js'

let _drawing = false
let _lastX = 0, _lastY = 0
let _buffer = null

function smudgeStamp(ctx, x, y, state) {
  const r = state.smudgeSize / 2
  const strength = state.smudgeStrength

  const x0 = Math.max(0, Math.floor(x - r))
  const y0 = Math.max(0, Math.floor(y - r))
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2))
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2))

  if (w <= 0 || h <= 0) return

  // Initialize buffer on first stamp
  if (!_buffer) {
    _buffer = ctx.getImageData(x0, y0, w, h)
  }

  // Sample current canvas
  const current = ctx.getImageData(x0, y0, w, h)

  // Blend buffer with current based on strength
  const result = new Uint8ClampedArray(current.data)
  for (let i = 0; i < result.length; i += 4) {
    const px = (i / 4) % w
    const py = Math.floor((i / 4) / w)
    const dx = px - r, dy = py - r
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= r) {
      const falloff = 1 - (dist / r)
      const blend = strength * falloff

      result[i] = current.data[i] * (1 - blend) + _buffer.data[i] * blend
      result[i + 1] = current.data[i + 1] * (1 - blend) + _buffer.data[i + 1] * blend
      result[i + 2] = current.data[i + 2] * (1 - blend) + _buffer.data[i + 2] * blend
      result[i + 3] = current.data[i + 3]
    }
  }

  ctx.putImageData(new ImageData(result, w, h), x0, y0)

  // Update buffer for next stroke
  _buffer = ctx.getImageData(x0, y0, w, h)
}

export default {
  id: 'smudge',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _drawing = true
    _lastX = e.x; _lastY = e.y
    _buffer = null
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      smudgeStamp(ctx, e.x, e.y, state)
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
    const spacing = Math.max(1, state.smudgeSize * 0.15)
    if (dist < spacing) return
    const steps = Math.floor(dist / spacing)
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      for (let i = 1; i <= steps; i++) {
        smudgeStamp(ctx, _lastX + dx * i / steps, _lastY + dy * i / steps, state)
      }
    }, true)
    _lastX += dx * steps / dist
    _lastY += dy * steps / dist
    toolCtx.invalidate()
  },

  onPointerUp(e, toolCtx) {
    if (!_drawing) return
    _drawing = false
    _buffer = null
    toolCtx.pushHistory('Smudge')
  },

  renderOverlay(ctx, state) {
    if (!state.cursorInCanvas) return
    const { cursorX: x, cursorY: y, smudgeSize, zoom } = state
    const r = smudgeSize / 2
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
