import { rgbToHex } from '../editorState.js'

export default {
  id: 'eyedropper',
  cursor: 'crosshair',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const x = Math.round(e.x)
    const y = Math.round(e.y)
    if (x < 0 || y < 0 || x >= state.canvasWidth || y >= state.canvasHeight) return

    // Composite all visible layers at (x,y) into a 1×1 canvas to get the true merged color
    const offscreen = new OffscreenCanvas(1, 1)
    const ctx = offscreen.getContext('2d', { willReadFrequently: true })
    for (const layer of state.layers) {
      if (!layer.visible) continue
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = layer.blendMode
      ctx.drawImage(layer.canvas, layer.offsetX - x, layer.offsetY - y)
      ctx.restore()
    }
    const px = ctx.getImageData(0, 0, 1, 1).data
    const hex = rgbToHex(px[0], px[1], px[2])
    if (e.altKey) state.bgColor = hex
    else state.fgColor = hex
  },

  onPointerMove() {},
  onPointerUp() {},
  renderOverlay() {},
}
