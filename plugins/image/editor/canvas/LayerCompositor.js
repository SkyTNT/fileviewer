const CHECKER_SIZE = 8
const CHECKER_LIGHT = '#cccccc'
const CHECKER_DARK = '#ffffff'

export function drawCheckerboard(ctx, w, h) {
  for (let y = 0; y < h; y += CHECKER_SIZE) {
    for (let x = 0; x < w; x += CHECKER_SIZE) {
      ctx.fillStyle = ((x / CHECKER_SIZE + y / CHECKER_SIZE) % 2 === 0) ? CHECKER_LIGHT : CHECKER_DARK
      ctx.fillRect(x, y, Math.min(CHECKER_SIZE, w - x), Math.min(CHECKER_SIZE, h - y))
    }
  }
}

export function compositeLayers(ctx, layers, w, h) {
  ctx.clearRect(0, 0, w, h)
  drawCheckerboard(ctx, w, h)
  for (const layer of layers) {
    if (!layer.visible) continue
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blendMode
    ctx.drawImage(layer.canvas, layer.offsetX, layer.offsetY)
    ctx.restore()
  }
}

// Returns a flat ImageData of all layers composited
export async function flattenToImageData(layers, w, h) {
  const offscreen = new OffscreenCanvas(w, h)
  const ctx = offscreen.getContext('2d')
  for (const layer of layers) {
    if (!layer.visible) continue
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blendMode
    ctx.drawImage(layer.canvas, layer.offsetX, layer.offsetY)
    ctx.restore()
  }
  return ctx.getImageData(0, 0, w, h)
}

// Returns a Blob (PNG by default, or with format/quality)
export async function flattenToBlob(layers, w, h, format = 'image/png', quality = 0.92) {
  const offscreen = new OffscreenCanvas(w, h)
  const ctx = offscreen.getContext('2d')
  for (const layer of layers) {
    if (!layer.visible) continue
    ctx.save()
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blendMode
    ctx.drawImage(layer.canvas, layer.offsetX, layer.offsetY)
    ctx.restore()
  }
  return offscreen.convertToBlob({ type: format, quality })
}
