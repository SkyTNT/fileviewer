import { rgbToHex } from '../editorState.js'

export default {
  id: 'eyedropper',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    // Sample from the composite (use the first visible layer that has a pixel here)
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i]
      if (!layer.visible) continue
      const lx = Math.round(e.x - layer.offsetX)
      const ly = Math.round(e.y - layer.offsetY)
      if (lx < 0 || ly < 0 || lx >= layer.canvas.width || ly >= layer.canvas.height) continue
      const ctx = layer.canvas.getContext('2d')
      const px = ctx.getImageData(lx, ly, 1, 1).data
      if (px[3] > 0) {
        const hex = rgbToHex(px[0], px[1], px[2])
        if (e.altKey) state.bgColor = hex
        else state.fgColor = hex
        break
      }
    }
  },

  onPointerMove() {},
  onPointerUp() {},
  renderOverlay() {},
}
