import { getActiveLayer } from '../editorState.js'
import { watch } from 'vue'

let _input = null        // hidden textarea for keyboard capture
let _text = ''
let _clickX = 0, _clickY = 0
let _toolCtx = null
let _unwatch = null

function fontString(state, size) {
  return `${state.textBold ? 'bold ' : ''}${state.textItalic ? 'italic ' : ''}${size}px ${state.textFont}`
}

function removeInput() {
  if (_input) {
    _input.remove()
    _input = null
  }
  if (_unwatch) {
    _unwatch()
    _unwatch = null
  }
  _text = ''
  _toolCtx = null
}

function commitText(toolCtx) {
  const text = _text.trim()
  removeInput()
  if (!text) return
  const { state, pushHistory, invalidate } = toolCtx
  const layer = getActiveLayer(state)
  if (!layer || layer.locked) return
  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
  ctx.save()
  ctx.font = fontString(state, state.textSize)
  ctx.fillStyle = state.fgColor
  ctx.textBaseline = 'top'
  const lineHeight = state.textSize * 1.2
  text.split('\n').forEach((line, i) => {
    ctx.fillText(line, _clickX, _clickY + i * lineHeight)
  })
  ctx.restore()
  pushHistory('Text')
  state.isDirty = true
  invalidate()
}

export default {
  id: 'text',
  cursor: 'text',

  onPointerDown(e, toolCtx) {
    if (_input) { commitText(toolCtx) }
    const { state, viewport } = toolCtx
    _toolCtx = toolCtx
    _clickX = e.x
    _clickY = e.y
    _text = ''

    // Hidden textarea appended to body just to capture keyboard input
    _input = document.createElement('textarea')
    _input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;'
    _input.addEventListener('input', () => {
      _text = _input.value
      state.paintTick++
    })
    _input.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') {
        removeInput()
        state.paintTick++
      }
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault()
        commitText(toolCtx)
        state.paintTick++
      }
      evt.stopPropagation()
    })
    document.body.appendChild(_input)
    setTimeout(() => _input?.focus(), 0)

    _unwatch = watch(
      () => [state.textFont, state.textSize, state.textBold, state.textItalic, state.fgColor],
      () => { state.paintTick++ }
    )
  },

  onPointerMove() {},
  onPointerUp() {},

  renderOverlay(ctx, state) {
    if (!_input) return
    const { viewport } = _toolCtx
    const lineHeight = state.textSize * 1.2
    const lines = _text.split('\n')

    ctx.save()
    ctx.font = fontString(state, state.textSize)
    ctx.fillStyle = state.fgColor
    ctx.textBaseline = 'top'

    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l || ' ').width), 80)
    const boxH = lines.length * lineHeight

    ctx.strokeStyle = 'rgba(128,128,128,0.8)'
    ctx.lineWidth = 1 / state.zoom
    ctx.setLineDash([4 / state.zoom, 3 / state.zoom])
    ctx.strokeRect(_clickX, _clickY, maxWidth + 4 / state.zoom, boxH + 4 / state.zoom)
    ctx.setLineDash([])

    // Draw text
    lines.forEach((line, i) => {
      ctx.fillText(line, _clickX, _clickY + i * lineHeight)
    })

    // Draw cursor blinking
    const cursorLineIdx = _text.slice(0, _input?.selectionStart ?? _text.length).split('\n').length - 1
    const cursorLineText = lines[cursorLineIdx] ?? ''
    const charsBefore = _text.slice(0, _input?.selectionStart ?? _text.length).split('\n').pop()
    const cx = _clickX + ctx.measureText(charsBefore).width
    const cy = _clickY + cursorLineIdx * lineHeight
    const now = Date.now()
    if (Math.floor(now / 500) % 2 === 0) {
      ctx.beginPath()
      ctx.strokeStyle = state.fgColor
      ctx.lineWidth = 1 / state.zoom
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx, cy + state.textSize)
      ctx.stroke()
    }

    ctx.restore()
  },

  onDeactivate(toolCtx) {
    commitText(toolCtx)
  },
}
