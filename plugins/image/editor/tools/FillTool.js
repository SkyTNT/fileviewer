import { getActiveLayer, hexToRgb } from '../editorState.js'
import { selectionToMask } from '../selectionUtils.js'

function floodFillCanvas(canvas, sx, sy, fillR, fillG, fillB, tolerance, mask) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const w = canvas.width, h = canvas.height
  const imgData = ctx.getImageData(0, 0, w, h)
  const data = imgData.data
  sx = Math.round(sx); sy = Math.round(sy)
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return

  const si = (sy * w + sx) * 4
  const tr = data[si], tg = data[si+1], tb = data[si+2], ta = data[si+3]
  if (tr === fillR && tg === fillG && tb === fillB && ta === 255) return

  function matches(i) {
    return Math.max(
      Math.abs(data[i] - tr), Math.abs(data[i+1] - tg),
      Math.abs(data[i+2] - tb), Math.abs(data[i+3] - ta),
    ) <= tolerance
  }

  const visited = new Uint8Array(w * h)
  const queue = [[sx, sy]]
  visited[sy * w + sx] = 1

  while (queue.length > 0) {
    const [x, y] = queue.pop()
    const pi = (y * w + x) * 4
    if (!matches(pi)) continue
    // Respect selection mask
    if (mask && !mask[y * w + x]) continue
    data[pi] = fillR; data[pi+1] = fillG; data[pi+2] = fillB; data[pi+3] = 255
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (visited[ni]) continue
      visited[ni] = 1
      queue.push([nx, ny])
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

export default {
  id: 'fill',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state, pushHistory, invalidate } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const { r, g, b } = hexToRgb(state.fgColor)
    const mask = state.selection ? selectionToMask(state.selection, state.canvasWidth, state.canvasHeight) : null
    floodFillCanvas(layer.canvas, e.x, e.y, r, g, b, state.fillTolerance, mask)
    pushHistory('Fill')
    state.isDirty = true
    invalidate()
  },

  onPointerMove() {},
  onPointerUp() {},
  renderOverlay() {},
}
