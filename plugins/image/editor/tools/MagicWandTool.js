import { getActiveLayer } from '../editorState.js'

function floodFill(imageData, startX, startY, tolerance) {
  const { data, width, height } = imageData
  const mask = new Uint8Array(width * height)
  startX = Math.round(startX); startY = Math.round(startY)
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return mask

  const idx = (x, y) => (y * width + x) * 4
  const si = idx(startX, startY)
  const sr = data[si], sg = data[si + 1], sb = data[si + 2], sa = data[si + 3]

  function matches(i) {
    return Math.max(
      Math.abs(data[i] - sr), Math.abs(data[i+1] - sg),
      Math.abs(data[i+2] - sb), Math.abs(data[i+3] - sa),
    ) <= tolerance
  }

  const queue = [[startX, startY]]
  const visited = new Uint8Array(width * height)
  visited[startY * width + startX] = 1

  while (queue.length > 0) {
    const [x, y] = queue.pop()
    const mi = y * width + x
    if (!matches(mi * 4)) continue
    mask[mi] = 1
    const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const ni = ny * width + nx
      if (visited[ni]) continue
      visited[ni] = 1
      queue.push([nx, ny])
    }
  }
  return mask
}

function maskToBounds(mask, w, h) {
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export default {
  id: 'magic-wand',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer) return
    const { canvas } = layer
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const mask = floodFill(imageData, e.x - layer.offsetX, e.y - layer.offsetY, state.wandTolerance)
    const bounds = maskToBounds(mask, canvas.width, canvas.height)
    state.selection = { type: 'mask', bounds, mask, points: null }
  },

  onPointerMove() {},
  onPointerUp() {},
  renderOverlay() {},
}
