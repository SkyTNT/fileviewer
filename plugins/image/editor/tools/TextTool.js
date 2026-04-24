import { getActiveLayer, hexToRgb } from '../editorState.js'

let _textarea = null
let _clickX = 0, _clickY = 0
let _toolCtx = null

function removeTextarea() {
  if (_textarea) {
    _textarea.remove()
    _textarea = null
  }
}

function commitText(toolCtx) {
  if (!_textarea) return
  const text = _textarea.value.trim()
  removeTextarea()
  if (!text) return
  const { state, pushHistory, invalidate } = toolCtx
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  const ctx = layer.canvas.getContext('2d')
  const style = (state.textBold ? 'bold ' : '') + (state.textItalic ? 'italic ' : '')
  ctx.save()
  ctx.font = `${style}${state.textSize}px ${state.textFont}`
  ctx.fillStyle = state.fgColor
  ctx.fillText(text, _clickX, _clickY)
  ctx.restore()
  pushHistory('Text')
  state.isDirty = true
  invalidate()
}

export default {
  id: 'text',
  cursor: 'text',

  onPointerDown(e, toolCtx) {
    if (_textarea) { commitText(toolCtx); return }
    const { state } = toolCtx
    _toolCtx = toolCtx
    _clickX = e.x
    _clickY = e.y

    // Find the viewport container to position the textarea
    const { viewport } = toolCtx
    const screenPos = viewport.canvasToScreen(e.x, e.y)
    const container = viewport.containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()

    _textarea = document.createElement('textarea')
    _textarea.style.cssText = `
      position:absolute;
      left:${screenPos.x - rect.left}px;
      top:${screenPos.y - rect.top}px;
      min-width:100px; min-height:28px;
      font:${(state.textBold?'bold ':'')+(state.textItalic?'italic ':'')}${state.textSize * state.zoom}px ${state.textFont};
      color:${state.fgColor};
      background:transparent;
      border:1px dashed #888;
      outline:none; resize:both;
      padding:2px; z-index:9999;
      overflow:hidden; white-space:pre;
    `
    _textarea.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { removeTextarea() }
      if (evt.key === 'Enter' && !evt.shiftKey) { evt.preventDefault(); commitText(toolCtx) }
      evt.stopPropagation()
    })
    container.appendChild(_textarea)
    _textarea.focus()
  },

  onPointerMove() {},
  onPointerUp() {},

  renderOverlay() {},

  onDeactivate(toolCtx) {
    commitText(toolCtx)
  },
}
