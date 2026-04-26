import { markRaw } from 'vue'

let _active = false
let _startX = 0, _startY = 0
let _cropBounds = null  // { x, y, w, h } in canvas coords
let _draggingHandle = null  // 'nw'|'ne'|'sw'|'se'|'move'|null
let _handleStart = null

const HANDLE_SIZE = 8

function getHandles(b) {
  return {
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    sw: { x: b.x, y: b.y + b.h },
    se: { x: b.x + b.w, y: b.y + b.h },
  }
}

function hitHandle(b, x, y, zoom) {
  const hs = HANDLE_SIZE / zoom
  const handles = getHandles(b)
  for (const [key, pos] of Object.entries(handles)) {
    if (Math.abs(x - pos.x) < hs && Math.abs(y - pos.y) < hs) return key
  }
  if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return 'move'
  return null
}

export default {
  id: 'crop',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    if (_cropBounds) {
      const hit = hitHandle(_cropBounds, e.x, e.y, state.zoom)
      if (hit) {
        _draggingHandle = hit
        _handleStart = { x: e.x, y: e.y, bounds: { ..._cropBounds } }
        return
      }
    }
    _active = true
    _startX = e.x; _startY = e.y
    _cropBounds = null
    _draggingHandle = null
  },

  onPointerMove(e, toolCtx) {
    if (_draggingHandle && _handleStart) {
      const dx = e.x - _handleStart.x, dy = e.y - _handleStart.y
      const b = { ..._handleStart.bounds }
      if (_draggingHandle === 'move') {
        b.x += dx; b.y += dy
      } else {
        if (_draggingHandle.includes('n')) { b.y += dy; b.h -= dy }
        if (_draggingHandle.includes('s')) { b.h += dy }
        if (_draggingHandle.includes('w')) { b.x += dx; b.w -= dx }
        if (_draggingHandle.includes('e')) { b.w += dx }
        b.w = Math.max(4, b.w); b.h = Math.max(4, b.h)
      }
      _cropBounds = b
      return
    }
    if (!_active) return
    const bx = Math.min(_startX, e.x), by = Math.min(_startY, e.y)
    _cropBounds = { x: bx, y: by, w: Math.abs(e.x - _startX), h: Math.abs(e.y - _startY) }
  },

  onPointerUp(e, toolCtx) {
    _active = false
    _draggingHandle = null
    _handleStart = null
    if (_cropBounds && (_cropBounds.w < 2 || _cropBounds.h < 2)) _cropBounds = null
    toolCtx.invalidate()
  },

  hasCrop() {
    return !!_cropBounds
  },

  cancelCrop(toolCtx) {
    _cropBounds = null
    _active = false
    _draggingHandle = null
    _handleStart = null
    toolCtx.invalidate()
  },

  applyCrop(toolCtx) {
    if (!_cropBounds) return
    const { state, pushHistory } = toolCtx
    const { x, y, w, h } = _cropBounds
    const cx = Math.round(x), cy = Math.round(y)
    const cw = Math.round(w), ch = Math.round(h)
    if (cw < 1 || ch < 1) return
    for (const layer of state.layers) {
      const newCanvas = markRaw(new OffscreenCanvas(cw, ch))
      const ctx2 = newCanvas.getContext('2d', { willReadFrequently: true })
      ctx2.drawImage(layer.canvas, cx, cy, cw, ch, 0, 0, cw, ch)
      layer.canvas = newCanvas
    }
    state.canvasWidth = cw
    state.canvasHeight = ch
    state.selection = null
    pushHistory('Crop')
    state.isDirty = true
    _cropBounds = null
    toolCtx.invalidate()
  },

  renderOverlay(ctx, state) {
    if (!_cropBounds) return
    const { x, y, w, h } = _cropBounds
    const cw = state.canvasWidth, ch = state.canvasHeight
    const z = state.zoom
    ctx.save()
    // Dark overlay outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, cw, y)
    ctx.fillRect(0, y + h, cw, ch - y - h)
    ctx.fillRect(0, y, x, h)
    ctx.fillRect(x + w, y, cw - x - w, h)
    // Crop border
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1 / z
    ctx.strokeRect(x, y, w, h)
    // Rule-of-thirds grid
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 0.5 / z
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3); ctx.stroke()
    }
    // Corner handles
    const hs = HANDLE_SIZE / z
    ctx.fillStyle = '#fff'
    const handles = getHandles({ x, y, w, h })
    for (const pos of Object.values(handles)) {
      ctx.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs)
    }
    ctx.restore()
  },
}
