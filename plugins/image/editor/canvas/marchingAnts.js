let _offset = 0
let _edgeCache = null  // { mask, w, h, edgeCanvas, whiteCanvas }

export function drawMarchingAnts(ctx, state) {
  if (!state.selection) return
  const { type, bounds, points, mask } = state.selection
  const z = state.zoom
  const dash = Math.max(2, 4 / z)
  const lw = 1 / z
  _offset = (_offset + 0.1 / z) % (dash * 2)

  if (type === 'mask' && mask) {
    const maskOffset = state.selection._maskOffset
    _drawMaskAnts(ctx, mask, state.canvasWidth, state.canvasHeight, _offset, dash, maskOffset)
    return
  }

  const mo = state.selection._maskOffset

  function drawShape(color, dashOffset) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.setLineDash([dash, dash])
    ctx.lineDashOffset = dashOffset
    ctx.beginPath()
    if (type === 'rect') {
      ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h)
    } else if (type === 'ellipse') {
      ctx.ellipse(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w / 2, bounds.h / 2, 0, 0, Math.PI * 2)
    } else if (type === 'lasso' && points?.length > 1) {
      // points are original coords, use translate for offset
      if (mo) ctx.translate(mo.dx, mo.dy)
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
      ctx.closePath()
    }
    ctx.stroke()
    ctx.restore()
  }

  drawShape('#ffffff', -_offset)
  drawShape('#000000', -_offset - dash)
}

function _drawMaskAnts(ctx, mask, w, h, offset, dash, maskOffset) {
  if (!_edgeCache || _edgeCache.mask !== mask || _edgeCache.w !== w || _edgeCache.h !== h) {
    const edgeCanvas = _buildEdgeCanvas(mask, w, h)
    const whiteCanvas = new OffscreenCanvas(w, h)
    const wctx = whiteCanvas.getContext('2d', { willReadFrequently: true })
    wctx.fillStyle = '#ffffff'
    wctx.fillRect(0, 0, w, h)
    wctx.globalCompositeOperation = 'destination-in'
    wctx.drawImage(edgeCanvas, 0, 0)
    _edgeCache = { mask, w, h, edgeCanvas, whiteCanvas }
  }

  const { edgeCanvas, whiteCanvas } = _edgeCache
  const ox = maskOffset?.dx ?? 0
  const oy = maskOffset?.dy ?? 0

  ctx.save()
  if (ox || oy) ctx.translate(ox, oy)
  ctx.drawImage(whiteCanvas, 0, 0)
  ctx.restore()

  const stripeW = Math.max(1, Math.round(dash))
  const patSize = stripeW * 2
  const pat = new OffscreenCanvas(patSize, patSize)
  const pctx = pat.getContext('2d', { willReadFrequently: true })
  pctx.fillStyle = '#000000'
  pctx.fillRect(0, 0, stripeW, stripeW)
  pctx.fillRect(stripeW, stripeW, stripeW, stripeW)

  const bt = new OffscreenCanvas(w, h)
  const btx = bt.getContext('2d', { willReadFrequently: true })
  const pattern = btx.createPattern(pat, 'repeat')
  const off = Math.round(offset) % patSize
  pattern.setTransform(new DOMMatrix().translateSelf(off, off))
  btx.fillStyle = pattern
  btx.fillRect(0, 0, w, h)
  btx.globalCompositeOperation = 'destination-in'
  btx.drawImage(edgeCanvas, 0, 0)

  ctx.save()
  if (ox || oy) ctx.translate(ox, oy)
  ctx.drawImage(bt, 0, 0)
  ctx.restore()
}

function _buildEdgeCanvas(mask, w, h) {
  const imgData = new ImageData(w, h)
  for (let i = 0; i < mask.length; i++) imgData.data[i * 4 + 3] = mask[i]

  const full = new OffscreenCanvas(w, h)
  full.getContext('2d', { willReadFrequently: true }).putImageData(imgData, 0, 0)

  const eroded = new OffscreenCanvas(w, h)
  const ectx = eroded.getContext('2d', { willReadFrequently: true })
  ectx.drawImage(full, 0, 0)
  ectx.globalCompositeOperation = 'destination-in'
  ectx.drawImage(full, 1, 0)
  ectx.drawImage(full, -1, 0)
  ectx.drawImage(full, 0, 1)
  ectx.drawImage(full, 0, -1)

  const edge = new OffscreenCanvas(w, h)
  const edgectx = edge.getContext('2d', { willReadFrequently: true })
  edgectx.drawImage(full, 0, 0)
  edgectx.globalCompositeOperation = 'destination-out'
  edgectx.drawImage(eroded, 0, 0)

  return edge
}

export function tickMarchingAnts() {
  _offset = (_offset + 0.3) % 16
}
