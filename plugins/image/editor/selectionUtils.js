let _maskCache = null  // { sel, w, h, mask }

// Convert any selection type to a Uint8Array mask (0=unselected, 255=selected)
export function selectionToMask(sel, w, h) {
  if (!sel) return null
  if (_maskCache && _maskCache.sel === sel && _maskCache.w === w && _maskCache.h === h)
    return _maskCache.mask
  const mask = _computeMask(sel, w, h)
  _maskCache = { sel, w, h, mask }
  return mask
}

function _computeMask(sel, w, h) {
  const mask = new Uint8Array(w * h)
  if (sel.type === 'mask' && sel.mask) {
    for (let i = 0; i < mask.length; i++) mask[i] = sel.mask[i] ? 255 : 0
    return mask
  }
  if (sel.type === 'rect') {
    const { x, y, w: bw, h: bh } = sel.bounds
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y))
    const x1 = Math.min(w, Math.round(x + bw)), y1 = Math.min(h, Math.round(y + bh))
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++)
        mask[py * w + px] = 255
    return mask
  }
  if (sel.type === 'ellipse') {
    const { x, y, w: bw, h: bh } = sel.bounds
    if (bw <= 0 || bh <= 0) return mask
    const oc = new OffscreenCanvas(w, h)
    const octx = oc.getContext('2d', { willReadFrequently: true })
    octx.fillStyle = '#fff'
    octx.beginPath()
    octx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2)
    octx.fill()
    const d = octx.getImageData(0, 0, w, h).data
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 0 ? 255 : 0
    return mask
  }
  if (sel.type === 'lasso' && sel.points?.length >= 3) {
    const oc = new OffscreenCanvas(w, h)
    const octx = oc.getContext('2d', { willReadFrequently: true })
    octx.fillStyle = '#fff'
    octx.beginPath()
    octx.moveTo(sel.points[0].x, sel.points[0].y)
    for (let i = 1; i < sel.points.length; i++) octx.lineTo(sel.points[i].x, sel.points[i].y)
    octx.closePath()
    octx.fill()
    const d = octx.getImageData(0, 0, w, h).data
    for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 0 ? 255 : 0
    return mask
  }
  return mask
}

export function maskUnion(a, b, len) {
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = (a[i] || b[i]) ? 255 : 0
  return out
}

export function maskSubtract(a, b, len) {
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = (a[i] && !b[i]) ? 255 : 0
  return out
}

export function maskBounds(mask, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const x = i % w, y = (i / w) | 0
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  if (maxX < 0) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

// Build an OffscreenCanvas where each pixel's alpha = mask value (for destination-in compositing)
function buildMaskCanvas(mask, w, h) {
  const mc = new OffscreenCanvas(w, h)
  const mctx = mc.getContext('2d', { willReadFrequently: true })
  const imgData = mctx.createImageData(w, h)
  for (let i = 0; i < mask.length; i++) {
    imgData.data[i * 4 + 3] = mask[i]
  }
  mctx.putImageData(imgData, 0, 0)
  return mc
}

// Cache: avoid recomputing mask+canvas every brush stroke
let _clipCache = null  // { sel, w, h, mask, maskCanvas }

function getClipCache(sel, w, h) {
  if (_clipCache && _clipCache.sel === sel && _clipCache.w === w && _clipCache.h === h) {
    return _clipCache
  }
  const mask = selectionToMask(sel, w, h)
  const maskCanvas = buildMaskCanvas(mask, w, h)
  _clipCache = { sel, w, h, mask, maskCanvas }
  return _clipCache
}

// Apply selection clip to ctx using canvas path (rect/ellipse) or save/restore pattern.
// For lasso/mask types, use withSelectionClipMask instead.
export function applyPathClip(ctx, sel) {
  if (!sel) return false
  const { type, bounds } = sel
  if (type === 'rect') {
    ctx.beginPath()
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h)
    ctx.clip()
    return true
  }
  if (type === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(bounds.x + bounds.w/2, bounds.y + bounds.h/2, bounds.w/2, bounds.h/2, 0, 0, Math.PI*2)
    ctx.clip()
    return true
  }
  return false
}

// For all selection types: draw to a temp canvas, mask it, composite back.
// drawFn receives the temp canvas context to draw into.
// copySource: if true, copies the layer content into tmp first (needed for destination-out ops like eraser)
export function withSelectionClip(layerCtx, sel, canvasW, canvasH, drawFn, copySource = false) {
  if (!sel) { drawFn(layerCtx); return }
  const { type } = sel
  if (type === 'rect' || type === 'ellipse') {
    layerCtx.save()
    applyPathClip(layerCtx, sel)
    drawFn(layerCtx)
    layerCtx.restore()
    return
  }
  // lasso / mask: use pixel-level mask compositing
  const { mask, maskCanvas: mc } = getClipCache(sel, canvasW, canvasH)

  if (copySource) {
    // For destination-out ops (eraser): draw on a copy, then blend only the masked region back
    const tmp = new OffscreenCanvas(canvasW, canvasH)
    const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
    tmpCtx.drawImage(layerCtx.canvas, 0, 0)
    drawFn(tmpCtx)
    // Extract only the masked region from tmp
    const masked = new OffscreenCanvas(canvasW, canvasH)
    const maskedCtx = masked.getContext('2d', { willReadFrequently: true })
    maskedCtx.drawImage(tmp, 0, 0)
    maskedCtx.globalCompositeOperation = 'destination-in'
    maskedCtx.drawImage(mc, 0, 0)
    // Clear the masked region on layer, then draw the masked result
    layerCtx.save()
    layerCtx.globalCompositeOperation = 'destination-out'
    layerCtx.drawImage(mc, 0, 0)
    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.drawImage(masked, 0, 0)
    layerCtx.restore()
  } else {
    // For source-over ops (brush, gradient): draw on blank tmp, mask it, composite back
    const tmp = new OffscreenCanvas(canvasW, canvasH)
    const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
    drawFn(tmpCtx)
    tmpCtx.globalCompositeOperation = 'destination-in'
    tmpCtx.drawImage(mc, 0, 0)
    layerCtx.save()
    layerCtx.globalCompositeOperation = 'source-over'
    layerCtx.drawImage(tmp, 0, 0)
    layerCtx.restore()
  }
}

// Merge selection modes: returns new selection object
// Uses OffscreenCanvas compositing to avoid slow JS pixel loops on large canvases
export function mergeSelection(existing, newSel, mode, canvasW, canvasH) {
  if (mode === 'replace' || !existing) return newSel

  const oc = new OffscreenCanvas(canvasW, canvasH)
  const octx = oc.getContext('2d', { willReadFrequently: true })

  // Draw existing selection as white
  _drawSelectionToCtx(octx, existing, canvasW, canvasH)

  if (mode === 'add') {
    // Union: draw new on top with source-over
    octx.globalCompositeOperation = 'source-over'
    _drawSelectionToCtx(octx, newSel, canvasW, canvasH)
  } else {
    // Subtract: erase new from existing using destination-out
    octx.globalCompositeOperation = 'destination-out'
    _drawSelectionToCtx(octx, newSel, canvasW, canvasH)
  }

  const d = octx.getImageData(0, 0, canvasW, canvasH).data
  const mask = new Uint8Array(canvasW * canvasH)
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 0 ? 255 : 0
  const bounds = maskBounds(mask, canvasW, canvasH)
  if (bounds.w === 0 || bounds.h === 0) return null
  return { type: 'mask', bounds, mask }
}

// Draw a selection shape as opaque white onto ctx
function _drawSelectionToCtx(ctx, sel, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,1)'
  if (sel.type === 'rect') {
    ctx.fillRect(sel.bounds.x, sel.bounds.y, sel.bounds.w, sel.bounds.h)
  } else if (sel.type === 'ellipse') {
    const { x, y, w: bw, h: bh } = sel.bounds
    ctx.beginPath()
    ctx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (sel.type === 'lasso' && sel.points?.length >= 3) {
    ctx.beginPath()
    ctx.moveTo(sel.points[0].x, sel.points[0].y)
    for (let i = 1; i < sel.points.length; i++) ctx.lineTo(sel.points[i].x, sel.points[i].y)
    ctx.closePath()
    ctx.fill()
  } else if (sel.type === 'mask' && sel.mask) {
    const imgData = ctx.createImageData(w, h)
    for (let i = 0; i < sel.mask.length; i++) {
      imgData.data[i * 4] = imgData.data[i * 4 + 1] = imgData.data[i * 4 + 2] = 255
      imgData.data[i * 4 + 3] = sel.mask[i]
    }
    ctx.putImageData(imgData, 0, 0)
  }
}

// Extract ImageData of the selection area from a layer (pixels outside selection are zeroed)
export function getSelectionImageData(layer, sel, canvasW, canvasH) {
  const mask = selectionToMask(sel, canvasW, canvasH)
  const { bounds } = sel
  const x0 = Math.max(0, Math.round(bounds.x)), y0 = Math.max(0, Math.round(bounds.y))
  const x1 = Math.min(canvasW, Math.round(bounds.x + bounds.w))
  const y1 = Math.min(canvasH, Math.round(bounds.y + bounds.h))
  const rw = x1 - x0, rh = y1 - y0
  if (rw <= 0 || rh <= 0) return null
  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
  const srcData = ctx.getImageData(x0, y0, rw, rh)
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      if (!mask[(y0 + py) * canvasW + (x0 + px)]) {
        const di = (py * rw + px) * 4
        srcData.data[di] = srcData.data[di+1] = srcData.data[di+2] = srcData.data[di+3] = 0
      }
    }
  }
  return { imageData: srcData, x: x0, y: y0, w: rw, h: rh }
}

// Clear selection area on a layer canvas (set to transparent)
export function clearSelectionOnLayer(layer, sel, canvasW, canvasH) {
  const mask = selectionToMask(sel, canvasW, canvasH)
  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
  const x0 = Math.max(0, Math.round(sel.bounds.x)), y0 = Math.max(0, Math.round(sel.bounds.y))
  const x1 = Math.min(canvasW, Math.round(sel.bounds.x + sel.bounds.w))
  const y1 = Math.min(canvasH, Math.round(sel.bounds.y + sel.bounds.h))
  const rw = x1 - x0, rh = y1 - y0
  if (rw <= 0 || rh <= 0) return
  const imgData = ctx.getImageData(x0, y0, rw, rh)
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      if (mask[(y0 + py) * canvasW + (x0 + px)]) {
        const di = (py * rw + px) * 4
        imgData.data[di] = imgData.data[di+1] = imgData.data[di+2] = imgData.data[di+3] = 0
      }
    }
  }
  ctx.putImageData(imgData, x0, y0)
}

// Invert a selection mask (full canvas becomes selected, existing selection becomes unselected)
export function invertSelection(sel, canvasW, canvasH) {
  const mask = selectionToMask(sel, canvasW, canvasH) ?? new Uint8Array(canvasW * canvasH)
  const inv = new Uint8Array(canvasW * canvasH)
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 255
  const bounds = maskBounds(inv, canvasW, canvasH)
  if (bounds.w === 0 || bounds.h === 0) return null
  return { type: 'mask', bounds, mask: inv }
}
