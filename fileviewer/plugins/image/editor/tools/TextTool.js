import { getActiveLayer } from '../editorState.js'
import { watch } from 'vue'

let _input = null        // hidden textarea for keyboard capture
let _text = ''
let _clickX = 0, _clickY = 0
let _toolCtx = null
let _unwatch = null
let _dragging = false
let _dragOffX = 0, _dragOffY = 0
let _dragPending = false  // mousedown inside box, not yet confirmed as drag

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

function updateInputPos() {
  if (!_input || !_toolCtx) return
  const { state, viewport } = _toolCtx
  const lineHeight = state.textSize * 1.2
  const lines = _text.split('\n')
  const sel = _input.selectionStart ?? _text.length
  const lineIdx = _text.slice(0, sel).split('\n').length - 1
  const charsBefore = _text.slice(0, sel).split('\n').pop()
  const mc = document.createElement('canvas').getContext('2d')
  mc.font = fontString(state, state.textSize)
  const cx = _clickX + mc.measureText(charsBefore).width
  const cy = _clickY + lineIdx * lineHeight
  const sp = viewport.canvasToScreen(cx, cy)
  _input.style.left = `${sp.x}px`
  _input.style.top = `${sp.y}px`
  _input.style.height = `${state.textSize * state.zoom}px`
}

export default {
  id: 'text',
  cursor: 'text',

  onPointerDown(e, toolCtx) {
    if (_input) {
      const { state } = toolCtx
      const lineHeight = state.textSize * 1.2
      const lines = _text.split('\n')
      const _mc = document.createElement('canvas').getContext('2d')
      _mc.font = fontString(state, state.textSize)
      const maxWidth = Math.max(...lines.map(l => _mc.measureText(l || ' ').width), 80)
      const boxW = maxWidth + 4 / state.zoom
      const boxH = lines.length * lineHeight + 4 / state.zoom
      if (e.x >= _clickX && e.x <= _clickX + boxW && e.y >= _clickY && e.y <= _clickY + boxH) {
        _dragPending = true
        _dragOffX = e.x - _clickX
        _dragOffY = e.y - _clickY
        // compute caret position from click coords
        const lineIdx = Math.min(Math.floor((e.y - _clickY) / lineHeight), lines.length - 1)
        const line = lines[Math.max(0, lineIdx)]
        const relX = e.x - _clickX
        let charIdx = line.length
        for (let i = 0; i <= line.length; i++) {
          if (_mc.measureText(line.slice(0, i)).width >= relX) { charIdx = i; break }
        }
        const offset = lines.slice(0, Math.max(0, lineIdx)).reduce((s, l) => s + l.length + 1, 0) + charIdx
        setTimeout(() => { _input?.focus(); _input?.setSelectionRange(offset, offset) }, 0)
        return
      }
      commitText(toolCtx)
    }
    const { state, viewport } = toolCtx
    _toolCtx = toolCtx
    _clickX = e.x
    _clickY = e.y
    _text = ''

    // Hidden textarea appended to body just to capture keyboard input
    _input = document.createElement('textarea')
    const sp = viewport.canvasToScreen(_clickX, _clickY)
    _input.style.cssText = `position:fixed;left:${sp.x}px;top:${sp.y}px;width:1px;height:${state.textSize * state.zoom}px;opacity:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;`
    _input.addEventListener('input', () => {
      _text = _input.value
      state.paintTick++
      setTimeout(updateInputPos, 0)
    })
    _input.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') {
        removeInput()
        state.paintTick++
      }
      if (evt.key === 'Enter' && (evt.shiftKey || evt.ctrlKey)) {
        evt.preventDefault()
        commitText(toolCtx)
        state.paintTick++
      }
      evt.stopPropagation()
      setTimeout(updateInputPos, 0)
    })
    document.body.appendChild(_input)
    setTimeout(() => _input?.focus(), 0)

    _unwatch = watch(
      () => [state.textFont, state.textSize, state.textBold, state.textItalic, state.fgColor],
      () => { state.paintTick++ }
    )
  },

  onPointerMove(e, toolCtx) {
    if (_dragPending) {
      const dx = e.x - (_clickX + _dragOffX), dy = e.y - (_clickY + _dragOffY)
      if (Math.hypot(dx, dy) > 3 / toolCtx.state.zoom) _dragging = true
    }
    if (_dragging) {
      _clickX = e.x - _dragOffX
      _clickY = e.y - _dragOffY
      if (_input) {
        const sp = toolCtx.viewport.canvasToScreen(_clickX, _clickY)
        _input.style.left = `${sp.x}px`
        _input.style.top = `${sp.y}px`
      }
      toolCtx.state.paintTick++
    }
  },
  onPointerUp() { _dragging = false; _dragPending = false },

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
