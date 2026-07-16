import { getActiveLayer } from '../editorState.js'
import { withSelectionClip } from '../selectionUtils.js'

let _drawing = false
let _lastX = 0, _lastY = 0

function blurStamp(ctx, x, y, state) {
  const r = state.blurSize / 2
  const strength = state.blurStrength

  // Sample area around the point
  const x0 = Math.max(0, Math.floor(x - r))
  const y0 = Math.max(0, Math.floor(y - r))
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2))
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2))

  if (w <= 0 || h <= 0) return

  const imgData = ctx.getImageData(x0, y0, w, h)
  const data = imgData.data
  const blurred = new Uint8ClampedArray(data)

  // Simple box blur
  const radius = Math.max(1, Math.floor(strength * 3))
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = px + dx, sy = py + dy
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            const si = (sy * w + sx) * 4
            rSum += data[si]
            gSum += data[si + 1]
            bSum += data[si + 2]
            aSum += data[si + 3]
            count++
          }
        }
      }
      const di = (py * w + px) * 4
      blurred[di] = rSum / count
      blurred[di + 1] = gSum / count
      blurred[di + 2] = bSum / count
      blurred[di + 3] = aSum / count
    }
  }

  // Apply with circular mask
  ctx.save()
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')

  const tmp = new OffscreenCanvas(w, h)
  const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
  tmpCtx.putImageData(new ImageData(blurred, w, h), 0, 0)

  ctx.globalCompositeOperation = 'source-over'
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.globalAlpha = 1
  ctx.drawImage(tmp, x0, y0)
  ctx.restore()
  ctx.restore()
}

export default {
  id: 'blur',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _drawing = true
    _lastX = e.x; _lastY = e.y
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      blurStamp(ctx, e.x, e.y, state)
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
    const spacing = Math.max(1, state.blurSize * 0.2)
    if (dist < spacing) return
    const steps = Math.floor(dist / spacing)
    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true })
    withSelectionClip(layerCtx, state.selection, state.canvasWidth, state.canvasHeight, (ctx) => {
      for (let i = 1; i <= steps; i++) {
        blurStamp(ctx, _lastX + dx * i / steps, _lastY + dy * i / steps, state)
      }
    }, true)
    _lastX += dx * steps / dist
    _lastY += dy * steps / dist
    toolCtx.invalidate()
  },

  onPointerUp(e, toolCtx) {
    if (!_drawing) return
    _drawing = false
    toolCtx.pushHistory('Blur')
  },

  renderOverlay(ctx, state) {
    if (!state.cursorInCanvas) return
    const { cursorX: x, cursorY: y, blurSize, zoom } = state
    const r = blurSize / 2
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
