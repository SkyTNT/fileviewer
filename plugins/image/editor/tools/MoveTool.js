import { getActiveLayer } from '../editorState.js'
import { getSelectionImageData, clearSelectionOnLayer } from '../selectionUtils.js'

// ── Vec2 math ─────────────────────────────────────────────────────────────────
const dot = (a, b) => a[0]*b[0] + a[1]*b[1]
const sub = (a, b) => [a[0]-b[0], a[1]-b[1]]
const add = (a, b) => [a[0]+b[0], a[1]+b[1]]
const scl = (v, s) => [v[0]*s, v[1]*s]
const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2]
const dst = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1])

// ── Box geometry ──────────────────────────────────────────────────────────────

function boxAxes(corners) {
  const [TL, TR] = corners
  const angle = Math.atan2(TR[1]-TL[1], TR[0]-TL[0])
  return { ux: [Math.cos(angle), Math.sin(angle)], uy: [-Math.sin(angle), Math.cos(angle)], angle }
}

function getHandles(corners, zoom) {
  const [TL, TR, BR, BL] = corners
  const N = mid(TL, TR), E = mid(TR, BR), S = mid(BR, BL), W = mid(TL, BL)
  const { angle } = boxAxes(corners)
  const rot = [N[0] + Math.sin(angle)*24/zoom, N[1] - Math.cos(angle)*24/zoom]
  return { TL, TR, BR, BL, N, E, S, W, rot }
}

function hitHandle(mx, my, corners, pivot, zoom) {
  const hs = 7/zoom, p = [mx, my]
  const h = getHandles(corners, zoom)
  if (dst(p, pivot) < hs*1.5) return 'pivot'
  if (dst(p, h.rot)  < hs*1.5) return 'rot'
  for (const name of ['TL','TR','BR','BL','N','E','S','W'])
    if (dst(p, h[name]) < hs) return name
  if (insideBox(mx, my, corners)) return 'move'
  return null
}

function insideBox(px, py, corners) {
  const [TL, TR, , BL] = corners
  const { ux, uy } = boxAxes(corners)
  const w = Math.hypot(TR[0]-TL[0], TR[1]-TL[1])
  const h = Math.hypot(BL[0]-TL[0], BL[1]-TL[1])
  const lx = dot(sub([px,py], TL), ux)
  const ly = dot(sub([px,py], TL), uy)
  return lx >= -1 && lx <= w+1 && ly >= -1 && ly <= h+1
}

const CURSORS = {
  TL: 'nwse-resize', BR: 'nwse-resize',
  TR: 'nesw-resize', BL: 'nesw-resize',
  N:  'ns-resize',   S:  'ns-resize',
  E:  'ew-resize',   W:  'ew-resize',
  rot: 'grab', pivot: 'move', move: 'move',
}

function cornersFromHandle(handle, mx, my, sc, lock, lockW, lockH) {
  const [TL, TR, BR, BL] = sc
  const { ux, uy } = boxAxes(sc)
  const M = [mx, my], MIN = 4

  const clampWH = (wRaw, hRaw) => {
    if (!lock || !lockW || !lockH) return [Math.max(MIN, wRaw), Math.max(MIN, hRaw)]
    const s = Math.max(wRaw/lockW, hRaw/lockH, MIN/lockW, MIN/lockH)
    return [lockW*s, lockH*s]
  }

  switch (handle) {
    case 'BR': { const [w,h] = clampWH(dot(sub(M,TL),ux), dot(sub(M,TL),uy)); return [TL, add(TL,scl(ux,w)), add(add(TL,scl(ux,w)),scl(uy,h)), add(TL,scl(uy,h))] }
    case 'TL': { const [w,h] = clampWH(dot(sub(BR,M),ux), dot(sub(BR,M),uy)); return [sub(sub(BR,scl(ux,w)),scl(uy,h)), sub(BR,scl(uy,h)), BR, sub(BR,scl(ux,w))] }
    case 'TR': { const [w,h] = clampWH(dot(sub(M,BL),ux), dot(sub(BL,M),uy)); return [sub(BL,scl(uy,h)), add(sub(BL,scl(uy,h)),scl(ux,w)), add(BL,scl(ux,w)), BL] }
    case 'BL': { const [w,h] = clampWH(dot(sub(TR,M),ux), dot(sub(M,TR),uy)); return [sub(TR,scl(ux,w)), TR, add(TR,scl(uy,h)), add(sub(TR,scl(ux,w)),scl(uy,h))] }
    case 'S': {
      const h = Math.max(MIN, dot(sub(M,TL),uy))
      if (!lock||!lockW||!lockH) return [TL, TR, add(TR,scl(uy,h)), add(TL,scl(uy,h))]
      const w = Math.max(MIN, h*lockW/lockH), c = mid(TL, TR)
      const [L, R] = [sub(c,scl(ux,w/2)), add(c,scl(ux,w/2))]
      return [L, R, add(R,scl(uy,h)), add(L,scl(uy,h))]
    }
    case 'N': {
      const h = Math.max(MIN, dot(sub(BL,M),uy))
      if (!lock||!lockW||!lockH) return [sub(BL,scl(uy,h)), sub(BR,scl(uy,h)), BR, BL]
      const w = Math.max(MIN, h*lockW/lockH), c = mid(BL, BR)
      const [L, R] = [sub(c,scl(ux,w/2)), add(c,scl(ux,w/2))]
      return [sub(L,scl(uy,h)), sub(R,scl(uy,h)), R, L]
    }
    case 'E': {
      const w = Math.max(MIN, dot(sub(M,TL),ux))
      if (!lock||!lockW||!lockH) return [TL, add(TL,scl(ux,w)), add(BL,scl(ux,w)), BL]
      const h = Math.max(MIN, w*lockH/lockW), c = mid(TL, BL)
      const [T, B] = [sub(c,scl(uy,h/2)), add(c,scl(uy,h/2))]
      return [T, add(T,scl(ux,w)), add(B,scl(ux,w)), B]
    }
    case 'W': {
      const w = Math.max(MIN, dot(sub(TR,M),ux))
      if (!lock||!lockW||!lockH) return [sub(TR,scl(ux,w)), TR, BR, sub(BR,scl(ux,w))]
      const h = Math.max(MIN, w*lockH/lockW), c = mid(TR, BR)
      const [T, B] = [sub(c,scl(uy,h/2)), add(c,scl(uy,h/2))]
      return [sub(T,scl(ux,w)), T, B, sub(B,scl(ux,w))]
    }
    default: return sc
  }
}

function transformPivotWithScale(pivot, oldCorners, newCorners) {
  const [oTL, oTR, , oBL] = oldCorners
  const { ux, uy } = boxAxes(oldCorners)
  const oW = Math.hypot(oTR[0]-oTL[0], oTR[1]-oTL[1])
  const oH = Math.hypot(oBL[0]-oTL[0], oBL[1]-oTL[1])
  if (oW < 1 || oH < 1) return pivot
  const lx = dot(sub(pivot, oTL), ux) / oW
  const ly = dot(sub(pivot, oTL), uy) / oH
  const [nTL, nTR, , nBL] = newCorners
  const { ux: nux, uy: nuy } = boxAxes(newCorners)
  const nW = Math.hypot(nTR[0]-nTL[0], nTR[1]-nTL[1])
  const nH = Math.hypot(nBL[0]-nTL[0], nBL[1]-nTL[1])
  return add(add(nTL, scl(nux, lx * nW)), scl(nuy, ly * nH))
}

function rotateCorners(mx, my, { pivot, mouse: sm, corners }) {
  const dA = Math.atan2(my-pivot[1], mx-pivot[0]) - Math.atan2(sm[1]-pivot[1], sm[0]-pivot[0])
  const cos = Math.cos(dA), sin = Math.sin(dA)
  return corners.map(([cx, cy]) => {
    const dx = cx-pivot[0], dy = cy-pivot[1]
    return [pivot[0]+dx*cos-dy*sin, pivot[1]+dx*sin+dy*cos]
  })
}

// ── TransformSession ──────────────────────────────────────────────────────────

class TransformSession {
  constructor() {
    this._lockAspect = true   // persists across transforms (user preference)
    this._reset()
  }

  get active()      { return this._active }
  get hoverCursor() { return this._cursor }
  get lockAspect()  { return this._lockAspect }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start(state, toolCtx) {
    if (this._active) return
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return

    let extracted
    if (state.selection) {
      extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
      if (!extracted) return
      clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
      state.selection = null
    } else {
      const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
      extracted = { imageData: ctx.getImageData(0, 0, state.canvasWidth, state.canvasHeight), x: 0, y: 0, w: state.canvasWidth, h: state.canvasHeight }
      ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight)
    }

    this._float = new OffscreenCanvas(extracted.w, extracted.h)
    this._float.getContext('2d', { willReadFrequently: true }).putImageData(extracted.imageData, 0, 0)
    this._origX = extracted.x; this._origY = extracted.y
    this._origW = extracted.w; this._origH = extracted.h

    this.corners = [
      [extracted.x,            extracted.y           ],
      [extracted.x+extracted.w, extracted.y           ],
      [extracted.x+extracted.w, extracted.y+extracted.h],
      [extracted.x,            extracted.y+extracted.h],
    ]
    this.pivot  = [extracted.x + extracted.w/2, extracted.y + extracted.h/2]
    this._active = true

    if (this._lockAspect) this._captureLockRatio()
    this._undoStack = [this._snap()]
    this._undoIdx   = 0
    toolCtx.invalidate()
  }

  apply(state, toolCtx) {
    if (!this._active || !this._float) return
    const layer = getActiveLayer(state)
    if (!layer) { this._reset(); toolCtx.invalidate(); return }

    const [TL, TR, , BL] = this.corners
    const a = (TR[0]-TL[0])/this._origW, b = (TR[1]-TL[1])/this._origW
    const c = (BL[0]-TL[0])/this._origH, d = (BL[1]-TL[1])/this._origH
    const tmp = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
    const tc = tmp.getContext('2d')
    tc.setTransform(a, b, c, d, TL[0], TL[1])
    tc.drawImage(this._float, 0, 0, this._origW, this._origH)
    tc.resetTransform()
    layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(tmp, 0, 0)

    this._reset()
    toolCtx.pushHistory('Transform')
    state.isDirty = true
    state.selection = null
    toolCtx.invalidate()
  }

  cancel(state, toolCtx) {
    if (!this._active || !this._float) return
    const layer = getActiveLayer(state)
    if (layer && !layer.locked)
      layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(this._float, this._origX, this._origY)
    this._reset()
    state.selection = null
    toolCtx.invalidate()
  }

  // ── Pointer events ──────────────────────────────────────────────────────────

  pointerDown(e, zoom) {
    const hit = hitHandle(e.x, e.y, this.corners, this.pivot, zoom)
    if (hit) {
      this._handle      = hit
      this._handleStart = { mouse: [e.x, e.y], corners: this.corners.map(c => [...c]), pivot: [...this.pivot] }
    }
    return hit   // null → clicked outside → caller should apply
  }

  pointerMove(e, zoom) {
    if (this._handle && this._handleStart) {
      this._applyHandle(e)
      return true
    }
    const hit = hitHandle(e.x, e.y, this.corners, this.pivot, zoom)
    if (hit !== this._hover) {
      this._hover  = hit
      this._cursor = CURSORS[hit] || 'default'
      return true
    }
    return false
  }

  pointerUp() {
    if (this._handle !== null) this._commit()
    this._handle = this._handleStart = null
  }

  // ── Aspect-ratio lock ───────────────────────────────────────────────────────

  toggleLock() {
    this._lockAspect = !this._lockAspect
    if (this._lockAspect && this.corners) this._captureLockRatio()
  }

  // ── Transform-local undo/redo ───────────────────────────────────────────────

  canUndo() { return this._undoIdx > 0 }
  canRedo() { return this._undoIdx < this._undoStack.length - 1 }

  undo(toolCtx) {
    if (!this.canUndo()) return false
    this._restore(this._undoStack[--this._undoIdx])
    toolCtx.invalidate()
    return true
  }

  redo(toolCtx) {
    if (!this.canRedo()) return false
    this._restore(this._undoStack[++this._undoIdx])
    toolCtx.invalidate()
    return true
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  render(ctx, zoom) {
    const [TL, TR, , BL] = this.corners
    const a = (TR[0]-TL[0])/this._origW, b = (TR[1]-TL[1])/this._origW
    const c = (BL[0]-TL[0])/this._origH, d = (BL[1]-TL[1])/this._origH
    ctx.save()
    ctx.transform(a, b, c, d, TL[0], TL[1])
    ctx.drawImage(this._float, 0, 0, this._origW, this._origH)
    ctx.restore()
    this._renderHandles(ctx, zoom)
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _snap()        { return { corners: this.corners.map(c => [...c]), pivot: [...this.pivot] } }
  _restore(snap) { this.corners = snap.corners.map(c => [...c]); this.pivot = [...snap.pivot] }

  _commit() {
    this._undoStack.splice(this._undoIdx + 1)
    this._undoStack.push(this._snap())
    this._undoIdx = this._undoStack.length - 1
  }

  _captureLockRatio() {
    const [TL, TR, , BL] = this.corners
    this._lockW = Math.hypot(TR[0]-TL[0], TR[1]-TL[1])
    this._lockH = Math.hypot(BL[0]-TL[0], BL[1]-TL[1])
  }

  _applyHandle(e) {
    const { mouse: sm, corners, pivot } = this._handleStart
    if (this._handle === 'rot') {
      this.corners = rotateCorners(e.x, e.y, this._handleStart)
    } else if (this._handle === 'pivot') {
      this.pivot = [e.x, e.y]
    } else if (this._handle === 'move') {
      const dx = e.x-sm[0], dy = e.y-sm[1]
      this.corners = corners.map(([cx, cy]) => [cx+dx, cy+dy])
      this.pivot   = [pivot[0]+dx, pivot[1]+dy]
    } else {
      let lw = this._lockW, lh = this._lockH
      if (e.shiftKey && !this._lockAspect) {
        const [sTL, sTR, , sBL] = corners
        lw = Math.hypot(sTR[0]-sTL[0], sTR[1]-sTL[1])
        lh = Math.hypot(sBL[0]-sTL[0], sBL[1]-sTL[1])
      }
      const oldCorners = corners
      this.corners = cornersFromHandle(this._handle, e.x, e.y, corners, this._lockAspect || e.shiftKey, lw, lh)
      this.pivot = transformPivotWithScale(pivot, oldCorners, this.corners)
    }
  }

  _renderHandles(ctx, zoom) {
    const z = zoom
    const [TL, TR, BR, BL] = this.corners
    const lw = 1.5/z, hs = 4.5/z, cr = 5/z, pr = 6/z
    const { angle } = boxAxes(this.corners)
    const N = mid(TL,TR), E = mid(TR,BR), S = mid(BR,BL), W = mid(TL,BL)
    const rotH = [N[0] + Math.sin(angle)*22/z, N[1] - Math.cos(angle)*22/z]

    ctx.save()

    // Bounding box outline
    ctx.strokeStyle = '#2196f3'; ctx.lineWidth = lw; ctx.setLineDash([5/z, 3/z])
    ctx.beginPath(); ctx.moveTo(TL[0],TL[1]); ctx.lineTo(TR[0],TR[1]); ctx.lineTo(BR[0],BR[1]); ctx.lineTo(BL[0],BL[1]); ctx.closePath(); ctx.stroke()
    ctx.setLineDash([])

    // Line to rotation handle
    ctx.lineWidth = 1/z; ctx.beginPath(); ctx.moveTo(N[0],N[1]); ctx.lineTo(rotH[0],rotH[1]); ctx.stroke()

    // Square handles (corners + edge midpoints)
    ctx.lineWidth = lw
    for (const [name, pos] of [['TL',TL],['TR',TR],['BR',BR],['BL',BL],['N',N],['E',E],['S',S],['W',W]]) {
      ctx.fillStyle   = this._hover === name ? '#2196f3' : '#fff'
      ctx.strokeStyle = '#2196f3'
      ctx.fillRect(pos[0]-hs, pos[1]-hs, hs*2, hs*2)
      ctx.strokeRect(pos[0]-hs, pos[1]-hs, hs*2, hs*2)
    }

    // Rotation handle circle + arc arrow
    ctx.beginPath(); ctx.arc(rotH[0], rotH[1], cr, 0, Math.PI*2)
    ctx.fillStyle = this._hover === 'rot' ? '#2196f3' : '#fff'; ctx.fill()
    ctx.strokeStyle = '#2196f3'; ctx.lineWidth = lw; ctx.stroke()
    ctx.beginPath(); ctx.arc(rotH[0], rotH[1], cr*0.55, -Math.PI*0.85, Math.PI*0.25)
    ctx.strokeStyle = this._hover === 'rot' ? '#fff' : '#2196f3'; ctx.lineWidth = 1.5/z; ctx.stroke()
    const ae = Math.PI*0.25, as = 2.5/z
    const ax = rotH[0]+Math.cos(ae)*cr*0.55, ay = rotH[1]+Math.sin(ae)*cr*0.55
    ctx.beginPath(); ctx.moveTo(ax-as*0.5, ay-as); ctx.lineTo(ax, ay); ctx.lineTo(ax+as, ay-as*0.5)
    ctx.strokeStyle = this._hover === 'rot' ? '#fff' : '#2196f3'; ctx.lineWidth = 1.5/z; ctx.stroke()

    // Pivot (circle + crosshair)
    const [pvx, pvy] = this.pivot
    ctx.beginPath(); ctx.arc(pvx, pvy, pr, 0, Math.PI*2)
    ctx.fillStyle = this._hover === 'pivot' ? 'rgba(33,150,243,0.85)' : 'rgba(255,255,255,0.9)'; ctx.fill()
    ctx.strokeStyle = '#2196f3'; ctx.lineWidth = lw; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pvx-pr,pvy); ctx.lineTo(pvx+pr,pvy); ctx.moveTo(pvx,pvy-pr); ctx.lineTo(pvx,pvy+pr)
    ctx.strokeStyle = this._hover === 'pivot' ? '#fff' : '#2196f3'; ctx.lineWidth = 1/z; ctx.stroke()

    ctx.restore()
  }

  _reset() {
    this._active      = false
    this._float       = null
    this._origX = this._origY = this._origW = this._origH = 0
    this.corners      = null
    this.pivot        = null
    this._handle      = null
    this._handleStart = null
    this._hover       = null
    this._cursor      = 'move'
    this._undoStack   = []
    this._undoIdx     = -1
    this._lockW = this._lockH = 0
    // _lockAspect intentionally NOT reset — it's a persistent user preference
  }
}

// ── MoveSession ───────────────────────────────────────────────────────────────

class MoveSession {
  constructor() { this._reset() }

  get active() { return this._active }

  begin(e, state, toolCtx) {
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    this._active = true
    this._dx = this._dy = 0
    this._startX = e.x; this._startY = e.y

    if (state.selection) {
      const extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
      if (!extracted) { this._active = false; return }
      this._selMode    = true
      this._origSel    = state.selection
      this._float      = new OffscreenCanvas(extracted.w, extracted.h)
      this._float.getContext('2d', { willReadFrequently: true }).putImageData(extracted.imageData, 0, 0)
      this._floatOrigX = this._floatX = extracted.x
      this._floatOrigY = this._floatY = extracted.y
      clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
      this._label = 'Move Selection'
    } else {
      this._selMode  = false
      this._preview  = new OffscreenCanvas(state.canvasWidth, state.canvasHeight)
      this._preview.getContext('2d').drawImage(layer.canvas, 0, 0)
      layer.canvas.getContext('2d', { willReadFrequently: true }).clearRect(0, 0, state.canvasWidth, state.canvasHeight)
      this._previewX = this._previewY = 0
      this._label = 'Move'
    }
    toolCtx.invalidate()
  }

  move(e, state, toolCtx) {
    if (!this._active) return
    this._dx = e.x - this._startX
    this._dy = e.y - this._startY
    if (this._selMode) {
      this._floatX = Math.round(this._floatOrigX + this._dx)
      this._floatY = Math.round(this._floatOrigY + this._dy)
      if (this._origSel) {
        state.selection = {
          ...this._origSel,
          bounds: { ...this._origSel.bounds, x: this._origSel.bounds.x+this._dx, y: this._origSel.bounds.y+this._dy },
          _maskOffset: { dx: Math.round(this._dx), dy: Math.round(this._dy) },
        }
      }
    } else {
      this._previewX = Math.round(this._dx)
      this._previewY = Math.round(this._dy)
    }
    toolCtx.invalidate()
  }

  end(state, toolCtx) {
    if (!this._active) return
    const layer = getActiveLayer(state)
    if (this._selMode && this._float) {
      if (layer && !layer.locked)
        layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(this._float, this._floatX, this._floatY)
      toolCtx.invalidate()
      if (this._origSel)
        state.selection = shiftSel(this._origSel, Math.round(this._dx), Math.round(this._dy), state.canvasWidth, state.canvasHeight)
    } else if (this._preview) {
      if (layer && !layer.locked)
        layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(this._preview, this._previewX, this._previewY)
      toolCtx.invalidate()
    }
    if (this._label) toolCtx.pushHistory(this._label)
    state.isDirty = true
    this._reset()
  }

  abort(state) {
    if (!this._active) return
    if (!this._selMode && this._preview) {
      const layer = getActiveLayer(state)
      if (layer) layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(this._preview, 0, 0)
    }
    this._reset()
  }

  renderOverlay(ctx) {
    if (!this._active) return
    ctx.save()
    if (this._selMode && this._float)
      ctx.drawImage(this._float, this._floatX, this._floatY)
    else if (this._preview)
      ctx.drawImage(this._preview, this._previewX, this._previewY)
    ctx.restore()
  }

  _reset() {
    this._active     = false
    this._selMode    = false
    this._float      = null
    this._floatOrigX = this._floatOrigY = 0
    this._floatX     = this._floatY     = 0
    this._origSel    = null
    this._dx = this._dy = 0
    this._startX = this._startY = 0
    this._label      = null
    this._preview    = null
    this._previewX   = this._previewY = 0
  }
}

// ── Instances ─────────────────────────────────────────────────────────────────

const tx = new TransformSession()
const mv = new MoveSession()

// ── Tool export ───────────────────────────────────────────────────────────────

export default {
  id: 'move',
  get cursor() { return tx.active ? tx.hoverCursor : 'move' },

  onPointerDown(e, toolCtx) {
    if (tx.active) {
      if (!tx.pointerDown(e, toolCtx.state.zoom)) tx.apply(toolCtx.state, toolCtx)
      return
    }
    mv.begin(e, toolCtx.state, toolCtx)
  },

  onPointerMove(e, toolCtx) {
    if (tx.active) {
      if (tx.pointerMove(e, toolCtx.state.zoom)) toolCtx.invalidate()
      return
    }
    mv.move(e, toolCtx.state, toolCtx)
  },

  onPointerUp(e, toolCtx) {
    if (tx.active) { tx.pointerUp(); return }
    mv.end(toolCtx.state, toolCtx)
  },

  onDeactivate(toolCtx) {
    if (tx.active) tx.apply(toolCtx.state, toolCtx)
    else mv.abort(toolCtx.state)
  },

  renderOverlay(ctx, state) {
    if (tx.active) { tx.render(ctx, state.zoom); return }
    mv.renderOverlay(ctx)
  },

  // Transform API (consumed by ToolOptionsBar and useKeyboard)
  startTransform:   (s, tc) => tx.start(s, tc),
  startTransformFromBitmap(bitmap, layer, toolCtx) {
    if (tx.active) return
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
    tx._float = new OffscreenCanvas(bitmap.width, bitmap.height)
    tx._float.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0)
    tx._origX = 0; tx._origY = 0
    tx._origW = bitmap.width; tx._origH = bitmap.height
    tx.corners = [[0,0],[bitmap.width,0],[bitmap.width,bitmap.height],[0,bitmap.height]]
    tx.pivot = [bitmap.width/2, bitmap.height/2]
    tx._active = true
    if (tx._lockAspect) tx._captureLockRatio()
    tx._undoStack = [tx._snap()]; tx._undoIdx = 0
    toolCtx.invalidate()
  },
  applyTransform:   (s, tc) => tx.apply(s, tc),
  cancelTransform:  (s, tc) => tx.cancel(s, tc),
  isTransforming:   ()      => tx.active,
  toggleLockAspect: ()      => tx.toggleLock(),
  isLockAspect:     ()      => tx.lockAspect,
  txCanUndo:        ()      => tx.canUndo(),
  txCanRedo:        ()      => tx.canRedo(),
  txUndo:           (tc)    => tx.undo(tc),
  txRedo:           (tc)    => tx.redo(tc),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shiftSel(sel, dx, dy, w, h) {
  if (!dx && !dy) return sel
  const bounds = { ...sel.bounds, x: sel.bounds.x+dx, y: sel.bounds.y+dy }
  if (sel.type === 'lasso' && sel.points)
    return { ...sel, bounds, points: sel.points.map(p => ({ x: p.x+dx, y: p.y+dy })) }
  if (!sel.mask) return { ...sel, bounds }
  const src = sel.mask, out = new Uint8Array(w*h)
  for (let i = 0; i < src.length; i++) {
    if (!src[i]) continue
    const sx = i%w, sy = (i/w)|0, nx = sx+dx, ny = sy+dy
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny*w+nx] = 255
  }
  return { type: 'mask', bounds, mask: out }
}
