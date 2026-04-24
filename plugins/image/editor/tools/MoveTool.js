import { getActiveLayer } from '../editorState.js'

let _dragging = false
let _startX = 0, _startY = 0
let _origX = 0, _origY = 0

export default {
  id: 'move',
  cursor: 'move',

  onPointerDown(e, toolCtx) {
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    _dragging = true
    _startX = e.x; _startY = e.y
    _origX = layer.offsetX; _origY = layer.offsetY
    toolCtx.pushHistory('Move')
  },

  onPointerMove(e, toolCtx) {
    if (!_dragging) return
    const { state } = toolCtx
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    layer.offsetX = _origX + (e.x - _startX)
    layer.offsetY = _origY + (e.y - _startY)
    toolCtx.invalidate()
  },

  onPointerUp(e, toolCtx) {
    if (!_dragging) return
    _dragging = false
    toolCtx.state.isDirty = true
  },

  renderOverlay() {},
}
