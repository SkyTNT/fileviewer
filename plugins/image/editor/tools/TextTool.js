import { getActiveLayer, hexToRgb } from '../editorState.js'
import { watch } from 'vue'

let _textarea = null
let _clickX = 0, _clickY = 0
let _toolCtx = null
let _unwatchStyle = null
const TEXTAREA_PADDING = 2  // matches padding:2px in textarea style
const TEXTAREA_BORDER = 1   // matches border:1px in textarea style

function updateTextareaStyle(state) {
  if (!_textarea || !_toolCtx) return
  const style = (state.textBold ? 'bold ' : '') + (state.textItalic ? 'italic ' : '')
  _textarea.style.font = `${style}${state.textSize * state.zoom}px ${state.textFont}`
  _textarea.style.color = state.fgColor
}

function updateTextareaPosition(toolCtx) {
  if (!_textarea) return
  const { viewport, state } = toolCtx
  const screenPos = viewport.canvasToScreen(_clickX, _clickY)
  const container = viewport.containerRef.value
  if (!container) return
  const containerRect = container.getBoundingClientRect()
  const relX = screenPos.x - containerRect.left
  const relY = screenPos.y - containerRect.top
  _textarea.style.left = `${relX}px`
  _textarea.style.top = `${relY}px`
}

function removeTextarea() {
  if (_textarea) {
    _textarea.remove()
    _textarea = null
  }
  if (_unwatchStyle) {
    _unwatchStyle()
    _unwatchStyle = null
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
  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
  const style = (state.textBold ? 'bold ' : '') + (state.textItalic ? 'italic ' : '')
  ctx.save()
  ctx.font = `${style}${state.textSize}px ${state.textFont}`
  ctx.fillStyle = state.fgColor
  ctx.textBaseline = 'top'
  const offset = (TEXTAREA_PADDING + TEXTAREA_BORDER) / state.zoom
  ctx.fillText(text, _clickX + offset, _clickY + offset)
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

    _textarea = document.createElement('textarea')
    const containerRect = container.getBoundingClientRect()
    const relX = screenPos.x - containerRect.left
    const relY = screenPos.y - containerRect.top
    _textarea.style.cssText = `
      position:absolute;
      left:${relX}px;
      top:${relY}px;
      min-width:100px; min-height:28px;
      font:${(state.textBold?'bold ':'')+(state.textItalic?'italic ':'')}${state.textSize * state.zoom}px ${state.textFont};
      line-height:1;
      color:${state.fgColor};
      background:transparent;
      border:1px dashed #888;
      outline:none; resize:both;
      padding:2px; z-index:99999;
      overflow:hidden; white-space:pre;
    `
    _textarea.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') { removeTextarea() }
      if (evt.key === 'Enter' && !evt.shiftKey) { evt.preventDefault(); commitText(toolCtx) }
      evt.stopPropagation()
    })
    container.appendChild(_textarea)
    setTimeout(() => _textarea?.focus(), 0)

    // Watch for style changes
    _unwatchStyle = watch(
      () => [state.textFont, state.textSize, state.textBold, state.textItalic, state.fgColor, state.zoom, state.panX, state.panY],
      () => {
        updateTextareaStyle(state)
        updateTextareaPosition(toolCtx)
      }
    )
  },

  onPointerMove() {},
  onPointerUp() {},

  renderOverlay() {},

  onDeactivate(toolCtx) {
    commitText(toolCtx)
  },
}
