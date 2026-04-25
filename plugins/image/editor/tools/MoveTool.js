import { getActiveLayer } from '../editorState.js'
import { getSelectionImageData, clearSelectionOnLayer } from '../selectionUtils.js'

// ── Normal move state ────────────────────────────────────────────────────────
let _dragging = false
let _startX = 0, _startY = 0
let _origX = 0, _origY = 0
let _selMode = false
let _floatCanvas = null
let _floatOrigX = 0, _floatOrigY = 0
let _floatX = 0, _floatY = 0
let _origSel = null
let _dx = 0, _dy = 0
let _pendingLabel = null

// ── Transform state ──────────────────────────────────────────────────────────
let _txFloating = false
let _txFloat = null       // OffscreenCanvas: extracted pixels (origW × origH)
let _txOrigX = 0, _txOrigY = 0  // top-left of original selection bounds
let _txOrigW = 0, _txOrigH = 0  // original size
let _txCorners = null     // [[x,y]×4] order: TL, TR, BR, BL
let _txPivot = null       // [x, y] rotation pivot in canvas coords
let _txHandle = null      // currently dragged handle id
let _txHandleStart = null // { mouse:[x,y], corners:[[x,y]×4], pivot:[x,y] }
let _hoverHandle = null
let _hoverCursor = 'move'

// ── Math helpers ─────────────────────────────────────────────────────────────
function _dot(v1, v2) { return v1[0] * v2[0] + v1[1] * v2[1] }
function _sub(a, b) { return [a[0] - b[0], a[1] - b[1]] }
function _add(a, b) { return [a[0] + b[0], a[1] + b[1]] }
function _scl(v, s) { return [v[0] * s, v[1] * s] }
function _mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
function _dst(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by) }

// Returns { ux, uy, angle } – local axes of the bounding box derived from TL→TR direction
function _boxAxes(corners) {
  const [TL, TR] = corners
  const angle = Math.atan2(TR[1] - TL[1], TR[0] - TL[0])
  return { ux: [Math.cos(angle), Math.sin(angle)], uy: [-Math.sin(angle), Math.cos(angle)], angle }
}

// Returns all named handle positions in canvas coords
function _getHandles(corners, zoom) {
  const [TL, TR, BR, BL] = corners
  const N = _mid(TL, TR), E = _mid(TR, BR), S = _mid(BR, BL), W = _mid(TL, BL)
  const { angle } = _boxAxes(corners)
  // Outward normal from top edge: [sin θ, -cos θ]  (for θ=0 this is [0,-1] = upward ✓)
  const nx = Math.sin(angle), ny = -Math.cos(angle)
  const rotDist = 24 / zoom
  const rot = [N[0] + nx * rotDist, N[1] + ny * rotDist]
  return { TL, TR, BR, BL, N, E, S, W, rot }
}

// Returns handle id that was hit, or null
function _hitHandle(mx, my, corners, pivot, zoom) {
  const hs = 7 / zoom
  const h = _getHandles(corners, zoom)
  if (_dst(mx, my, pivot[0], pivot[1]) < hs * 1.5) return 'pivot'
  if (_dst(mx, my, h.rot[0], h.rot[1]) < hs * 1.5) return 'rot'
  for (const name of ['TL', 'TR', 'BR', 'BL', 'N', 'E', 'S', 'W']) {
    if (_dst(mx, my, h[name][0], h[name][1]) < hs) return name
  }
  if (_insideBox(mx, my, corners)) return 'move'
  return null
}

function _insideBox(px, py, corners) {
  const [TL, TR, , BL] = corners
  const { ux, uy } = _boxAxes(corners)
  const w = Math.hypot(TR[0] - TL[0], TR[1] - TL[1])
  const h = Math.hypot(BL[0] - TL[0], BL[1] - TL[1])
  const lx = _dot(_sub([px, py], TL), ux)
  const ly = _dot(_sub([px, py], TL), uy)
  return lx >= -1 && lx <= w + 1 && ly >= -1 && ly <= h + 1
}

const _CURSORS = {
  TL: 'nwse-resize', BR: 'nwse-resize',
  TR: 'nesw-resize', BL: 'nesw-resize',
  N: 'ns-resize', S: 'ns-resize',
  E: 'ew-resize', W: 'ew-resize',
  rot: 'grab', pivot: 'move', move: 'move',
}

// Compute new corners after dragging a resize handle.
// startCorners: corners at drag start (preserved angle).
function _cornersFromHandle(handle, mx, my, startCorners) {
  const [TL, TR, BR, BL] = startCorners
  const { ux, uy } = _boxAxes(startCorners)
  const M = [mx, my]
  const MIN = 4

  switch (handle) {
    case 'BR': {
      const w = Math.max(MIN, _dot(_sub(M, TL), ux))
      const h = Math.max(MIN, _dot(_sub(M, TL), uy))
      return [TL, _add(TL, _scl(ux, w)), _add(_add(TL, _scl(ux, w)), _scl(uy, h)), _add(TL, _scl(uy, h))]
    }
    case 'TL': {
      const w = Math.max(MIN, _dot(_sub(BR, M), ux))
      const h = Math.max(MIN, _dot(_sub(BR, M), uy))
      return [
        _sub(_sub(BR, _scl(ux, w)), _scl(uy, h)),
        _sub(BR, _scl(uy, h)),
        BR,
        _sub(BR, _scl(ux, w)),
      ]
    }
    case 'TR': {
      const w = Math.max(MIN, _dot(_sub(M, BL), ux))
      const h = Math.max(MIN, _dot(_sub(BL, M), uy))
      return [
        _sub(BL, _scl(uy, h)),
        _add(_sub(BL, _scl(uy, h)), _scl(ux, w)),
        _add(BL, _scl(ux, w)),
        BL,
      ]
    }
    case 'BL': {
      const w = Math.max(MIN, _dot(_sub(TR, M), ux))
      const h = Math.max(MIN, _dot(_sub(M, TR), uy))
      return [
        _sub(TR, _scl(ux, w)),
        TR,
        _add(TR, _scl(uy, h)),
        _add(_sub(TR, _scl(ux, w)), _scl(uy, h)),
      ]
    }
    case 'S': {
      const h = Math.max(MIN, _dot(_sub(M, TL), uy))
      return [TL, TR, _add(TR, _scl(uy, h)), _add(TL, _scl(uy, h))]
    }
    case 'N': {
      const h = Math.max(MIN, _dot(_sub(BL, M), uy))
      return [_sub(BL, _scl(uy, h)), _sub(BR, _scl(uy, h)), BR, BL]
    }
    case 'E': {
      const w = Math.max(MIN, _dot(_sub(M, TL), ux))
      return [TL, _add(TL, _scl(ux, w)), _add(BL, _scl(ux, w)), BL]
    }
    case 'W': {
      const w = Math.max(MIN, _dot(_sub(TR, M), ux))
      return [_sub(TR, _scl(ux, w)), TR, BR, _sub(BR, _scl(ux, w))]
    }
    default: return startCorners
  }
}

// Rotate corners around pivot by the angle delta since drag start
function _rotateCorners(mx, my, startState) {
  const { pivot, mouse: sm, corners } = startState
  const dAngle = Math.atan2(my - pivot[1], mx - pivot[0]) - Math.atan2(sm[1] - pivot[1], sm[0] - pivot[0])
  const cos = Math.cos(dAngle), sin = Math.sin(dAngle)
  return corners.map(([cx, cy]) => {
    const dx = cx - pivot[0], dy = cy - pivot[1]
    return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos]
  })
}

// ── Transform lifecycle ───────────────────────────────────────────────────────

function startTransform(state, toolCtx) {
  if (_txFloating) return
  if (!state.selection) return
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  const extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
  if (!extracted) return

  clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
  toolCtx.invalidate()

  _txFloat = new OffscreenCanvas(extracted.w, extracted.h)
  _txFloat.getContext('2d', { willReadFrequently: true }).putImageData(extracted.imageData, 0, 0)
  _txOrigX = extracted.x; _txOrigY = extracted.y
  _txOrigW = extracted.w; _txOrigH = extracted.h

  _txCorners = [
    [extracted.x, extracted.y],
    [extracted.x + extracted.w, extracted.y],
    [extracted.x + extracted.w, extracted.y + extracted.h],
    [extracted.x, extracted.y + extracted.h],
  ]
  _txPivot = [extracted.x + extracted.w / 2, extracted.y + extracted.h / 2]
  _txFloating = true
  _txHandle = null; _txHandleStart = null
  state.selection = null
  toolCtx.invalidate()
}

function applyTransform(state, toolCtx) {
  if (!_txFloating || !_txFloat) return
  const layer = getActiveLayer(state)
  if (!layer) { _resetTx(); toolCtx.invalidate(); return }

  const [TL, TR, , BL] = _txCorners
  const a = (TR[0] - TL[0]) / _txOrigW
  const b = (TR[1] - TL[1]) / _txOrigW
  const c = (BL[0] - TL[0]) / _txOrigH
  const d = (BL[1] - TL[1]) / _txOrigH

  const tmp = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
  const tmpCtx = tmp.getContext('2d')
  tmpCtx.setTransform(a, b, c, d, TL[0], TL[1])
  tmpCtx.drawImage(_txFloat, 0, 0, _txOrigW, _txOrigH)
  tmpCtx.resetTransform()

  layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(tmp, 0, 0)

  _resetTx()
  toolCtx.pushHistory('Transform')
  state.isDirty = true
  state.selection = null
  toolCtx.invalidate()
}

function cancelTransform(state, toolCtx) {
  if (!_txFloating || !_txFloat) return
  const layer = getActiveLayer(state)
  if (layer && !layer.locked) {
    layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(_txFloat, _txOrigX, _txOrigY)
  }
  _resetTx()
  state.selection = null
  toolCtx.invalidate()
}

function _resetTx() {
  _txFloating = false; _txFloat = null
  _txOrigX = _txOrigY = _txOrigW = _txOrigH = 0
  _txCorners = null; _txPivot = null
  _txHandle = null; _txHandleStart = null
  _hoverHandle = null; _hoverCursor = 'move'
}

// ── Overlay rendering ─────────────────────────────────────────────────────────

function _renderTransform(ctx, state) {
  const z = state.zoom
  const [TL, TR, BR, BL] = _txCorners

  // Float canvas rendered with the affine transform defined by the 4 corners
  const a = (TR[0] - TL[0]) / _txOrigW
  const b = (TR[1] - TL[1]) / _txOrigW
  const c = (BL[0] - TL[0]) / _txOrigH
  const d = (BL[1] - TL[1]) / _txOrigH
  ctx.save()
  ctx.setTransform(a, b, c, d, TL[0], TL[1])
  ctx.drawImage(_txFloat, 0, 0, _txOrigW, _txOrigH)
  ctx.restore()

  ctx.save()
  const lw = 1.5 / z
  const hs = 4.5 / z  // half-size of square handle
  const cr = 5 / z    // rotation handle circle radius
  const pr = 6 / z    // pivot circle radius

  // Bounding box outline
  ctx.strokeStyle = '#2196f3'
  ctx.lineWidth = lw
  ctx.setLineDash([5 / z, 3 / z])
  ctx.beginPath()
  ctx.moveTo(TL[0], TL[1])
  ctx.lineTo(TR[0], TR[1])
  ctx.lineTo(BR[0], BR[1])
  ctx.lineTo(BL[0], BL[1])
  ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])

  const { angle } = _boxAxes(_txCorners)
  const N = _mid(TL, TR), E = _mid(TR, BR), S = _mid(BR, BL), W = _mid(TL, BL)
  const nx = Math.sin(angle), ny = -Math.cos(angle)
  const rotDist = 22 / z
  const rotH = [N[0] + nx * rotDist, N[1] + ny * rotDist]

  // Line from top-center to rotation handle
  ctx.strokeStyle = '#2196f3'
  ctx.lineWidth = 1 / z
  ctx.beginPath()
  ctx.moveTo(N[0], N[1])
  ctx.lineTo(rotH[0], rotH[1])
  ctx.stroke()

  // Square handles: corners + edge midpoints
  ctx.lineWidth = lw
  const squareHandles = [
    ['TL', TL], ['TR', TR], ['BR', BR], ['BL', BL],
    ['N', N], ['E', E], ['S', S], ['W', W],
  ]
  for (const [name, pos] of squareHandles) {
    ctx.fillStyle = _hoverHandle === name ? '#2196f3' : '#fff'
    ctx.strokeStyle = '#2196f3'
    ctx.fillRect(pos[0] - hs, pos[1] - hs, hs * 2, hs * 2)
    ctx.strokeRect(pos[0] - hs, pos[1] - hs, hs * 2, hs * 2)
  }

  // Rotation handle circle
  ctx.beginPath()
  ctx.arc(rotH[0], rotH[1], cr, 0, Math.PI * 2)
  ctx.fillStyle = _hoverHandle === 'rot' ? '#2196f3' : '#fff'
  ctx.fill()
  ctx.strokeStyle = '#2196f3'
  ctx.lineWidth = lw
  ctx.stroke()
  // Arc inside the circle to hint rotation
  ctx.beginPath()
  ctx.arc(rotH[0], rotH[1], cr * 0.55, -Math.PI * 0.85, Math.PI * 0.25)
  ctx.strokeStyle = _hoverHandle === 'rot' ? '#fff' : '#2196f3'
  ctx.lineWidth = 1.5 / z
  ctx.stroke()
  // Arrow tip at arc end
  const ae = Math.PI * 0.25
  const ax = rotH[0] + Math.cos(ae) * cr * 0.55
  const ay = rotH[1] + Math.sin(ae) * cr * 0.55
  const as = 2.5 / z
  const ac = _hoverHandle === 'rot' ? '#fff' : '#2196f3'
  ctx.beginPath()
  ctx.moveTo(ax - as * 0.5, ay - as)
  ctx.lineTo(ax, ay)
  ctx.lineTo(ax + as, ay - as * 0.5)
  ctx.strokeStyle = ac
  ctx.lineWidth = 1.5 / z
  ctx.stroke()

  // Pivot point (circle with crosshair)
  const [pvx, pvy] = _txPivot
  ctx.beginPath()
  ctx.arc(pvx, pvy, pr, 0, Math.PI * 2)
  ctx.fillStyle = _hoverHandle === 'pivot' ? 'rgba(33,150,243,0.85)' : 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.strokeStyle = '#2196f3'
  ctx.lineWidth = lw
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(pvx - pr, pvy)
  ctx.lineTo(pvx + pr, pvy)
  ctx.moveTo(pvx, pvy - pr)
  ctx.lineTo(pvx, pvy + pr)
  ctx.strokeStyle = _hoverHandle === 'pivot' ? '#fff' : '#2196f3'
  ctx.lineWidth = 1 / z
  ctx.stroke()

  ctx.restore()
}

// ── Tool object ───────────────────────────────────────────────────────────────

export default {
  id: 'move',
  get cursor() { return _hoverCursor },

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    if (_txFloating) {
      const hit = _hitHandle(e.x, e.y, _txCorners, _txPivot, state.zoom)
      if (hit) {
        _txHandle = hit
        _txHandleStart = {
          mouse: [e.x, e.y],
          corners: _txCorners.map(c => [...c]),
          pivot: [..._txPivot],
        }
      } else {
        // Click outside transform box → apply
        applyTransform(state, toolCtx)
      }
      return
    }
    // ── Normal move ──────────────────────────────────────────────────────────
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
      _pendingLabel = 'Move Selection'
      toolCtx.invalidate()
    } else {
      _selMode = false
      _origX = layer.offsetX; _origY = layer.offsetY
      _pendingLabel = 'Move'
    }
  },

  onPointerMove(e, toolCtx) {
    const { state } = toolCtx
    if (_txFloating) {
      if (_txHandle && _txHandleStart) {
        // Drag active handle
        if (_txHandle === 'rot') {
          _txCorners = _rotateCorners(e.x, e.y, _txHandleStart)
        } else if (_txHandle === 'pivot') {
          _txPivot = [e.x, e.y]
        } else if (_txHandle === 'move') {
          const { mouse: sm, corners, pivot } = _txHandleStart
          const dx = e.x - sm[0], dy = e.y - sm[1]
          _txCorners = corners.map(([cx, cy]) => [cx + dx, cy + dy])
          _txPivot = [pivot[0] + dx, pivot[1] + dy]
        } else {
          _txCorners = _cornersFromHandle(_txHandle, e.x, e.y, _txHandleStart.corners)
        }
        toolCtx.invalidate()
      } else {
        // Hover: update cursor when no drag is active
        const hit = _hitHandle(e.x, e.y, _txCorners, _txPivot, state.zoom)
        if (hit !== _hoverHandle) {
          _hoverHandle = hit
          _hoverCursor = _CURSORS[hit] || 'default'
          toolCtx.invalidate()
        }
      }
      return
    }
    if (!_dragging) return
    _dx = e.x - _startX
    _dy = e.y - _startY
    if (_selMode) {
      _floatX = Math.round(_floatOrigX + _dx)
      _floatY = Math.round(_floatOrigY + _dy)
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
    if (_txFloating) {
      _txHandle = null
      _txHandleStart = null
      return
    }
    if (!_dragging) return
    _dragging = false
    const { state } = toolCtx
    if (_selMode && _floatCanvas) {
      const layer = getActiveLayer(state)
      if (layer && !layer.locked) {
        layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(_floatCanvas, _floatX, _floatY)
        toolCtx.invalidate()
      }
      if (_origSel) {
        state.selection = _shiftSel(_origSel, Math.round(_dx), Math.round(_dy), state.canvasWidth, state.canvasHeight)
      }
      _floatCanvas = null
      _selMode = false
      _origSel = null
    }
    if (_pendingLabel) {
      toolCtx.pushHistory(_pendingLabel)
      _pendingLabel = null
    }
    state.isDirty = true
  },

  onDeactivate(toolCtx) {
    if (_txFloating) applyTransform(toolCtx.state, toolCtx)
  },

  renderOverlay(ctx, state) {
    if (_txFloating && _txFloat) {
      _renderTransform(ctx, state)
      return
    }
    if (_dragging && _selMode && _floatCanvas) {
      ctx.save()
      ctx.drawImage(_floatCanvas, _floatX, _floatY)
      ctx.restore()
    }
  },

  // Public API for ToolOptionsBar and keyboard handler
  startTransform,
  applyTransform,
  cancelTransform,
  isTransforming() { return _txFloating },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
