import { getActiveLayer } from '../editorState.js'
import { getSelectionImageData, clearSelectionOnLayer } from '../selectionUtils.js'

let _dragging = false
let _startX = 0, _startY = 0
let _origX = 0, _origY = 0
let _selMode = false
let _floatCanvas = null
let _floatOrigX = 0, _floatOrigY = 0
let _floatX = 0, _floatY = 0
let _origSel = null
let _dx = 0, _dy = 0

export default {
  id: 'move',
  cursor: 'move',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _dragging = true
    _dx = _dy = 0
    _startX = e.x; _startY = e.y

    if (state.selection) {
      _selMode = true
      _origSel = state.selection
      const extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
      if (!extracted) { _selMode = false; return }
      _floatCanvas = new OffscreenCanvas(extracted.w, extracted.h)
      _floatCanvas.getContext('2d', { willReadFrequently: true }).putImageData(extracted.imageData, 0, 0)
      _floatOrigX = _floatX = extracted.x
      _floatOrigY = _floatY = extracted.y
      clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
      toolCtx.pushHistory('Move Selection')
      toolCtx.invalidate()
    } else {
      _selMode = false
      _origX = layer.offsetX; _origY = layer.offsetY
      toolCtx.pushHistory('Move')
    }
  },

  onPointerMove(e, toolCtx) {
    if (!_dragging) return
    const { state } = toolCtx
    _dx = e.x - _startX
    _dy = e.y - _startY
    if (_selMode) {
      _floatX = Math.round(_floatOrigX + _dx)
      _floatY = Math.round(_floatOrigY + _dy)
      // Shift bounds for marching ants, keep original mask reference (no pixel recompute)
      if (_origSel) {
        state.selection = {
          ..._origSel,
          bounds: { ..._origSel.bounds, x: _origSel.bounds.x + _dx, y: _origSel.bounds.y + _dy },
          _maskOffset: { dx: Math.round(_dx), dy: Math.round(_dy) },
        }
      }
      toolCtx.invalidate()
    } else {
      const layer = getActiveLayer(state)
      if (!layer || layer.locked) return
      layer.offsetX = _origX + _dx
      layer.offsetY = _origY + _dy
      toolCtx.invalidate()
    }
  },

  onPointerUp(e, toolCtx) {
    if (!_dragging) return
    _dragging = false
    const { state } = toolCtx
    if (_selMode && _floatCanvas) {
      // Commit float to layer
      const layer = getActiveLayer(state)
      if (layer && !layer.locked) {
        layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(_floatCanvas, _floatX, _floatY)
        toolCtx.invalidate()
      }
      // Update selection position now (once, on release)
      if (_origSel) {
        state.selection = _shiftSel(_origSel, Math.round(_dx), Math.round(_dy), state.canvasWidth, state.canvasHeight)
      }
      _floatCanvas = null
      _selMode = false
      _origSel = null
    }
    state.isDirty = true
  },

  renderOverlay(ctx, state) {
    if (_dragging && _selMode && _floatCanvas) {
      ctx.save()
      ctx.drawImage(_floatCanvas, _floatX, _floatY)
      ctx.restore()
    }
  },
}

function _shiftSel(sel, dx, dy, w, h) {
  if (!dx && !dy) return sel
  const bounds = { ...sel.bounds, x: sel.bounds.x + dx, y: sel.bounds.y + dy }
  if (sel.type === 'lasso' && sel.points) {
    return { ...sel, bounds, points: sel.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  }
  if (!sel.mask) return { ...sel, bounds }
  const src = sel.mask
  const out = new Uint8Array(w * h)
  for (let i = 0; i < src.length; i++) {
    if (!src[i]) continue
    const sx = i % w, sy = (i / w) | 0
    const nx = sx + dx, ny = sy + dy
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 255
  }
  return { type: 'mask', bounds, mask: out }
}
