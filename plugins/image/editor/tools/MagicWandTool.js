import { getActiveLayer } from '../editorState.js'
import { mergeSelection, maskBounds } from '../selectionUtils.js'

function floodFill(imageData, startX, startY, tolerance) {
  const { data, width, height } = imageData
  const mask = new Uint8Array(width * height)
  startX = Math.round(startX); startY = Math.round(startY)
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return mask

  const si = (startY * width + startX) * 4
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
    mask[mi] = 255
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const ni = ny * width + nx
      if (visited[ni]) continue
      visited[ni] = 1
      queue.push([nx, ny])
    }
  }
  return mask
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
    const bounds = maskBounds(mask, canvas.width, canvas.height)
    const newSel = { type: 'mask', bounds, mask, points: null }
    state.selection = mergeSelection(state.selection, newSel, state.selectionMode, state.canvasWidth, state.canvasHeight)
  },

  onPointerMove() {},
  onPointerUp() {},
  renderOverlay() {},
}
