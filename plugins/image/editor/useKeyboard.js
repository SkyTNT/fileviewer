export function createKeyboardHandler(state, historyAPI, actions, isFocused) {
  const { undo, redo } = historyAPI

  return function handleKey({ key, ctrl, meta, shift, raw }) {
    if (!isFocused()) return
    const mod = ctrl || meta

    if (mod && !shift && key === 'z') { raw.preventDefault(); undo(state); return }
    if ((mod && shift && key === 'z') || (mod && !shift && key === 'y')) { raw.preventDefault(); redo(state); return }
    if (mod && !shift && key === 's') { raw.preventDefault(); actions.save(); return }
    if (mod && shift && key === 's') { raw.preventDefault(); actions.saveAs(); return }
    if (mod && key === 'e') { raw.preventDefault(); actions.exportDialog(); return }
    if (mod && key === '0') { raw.preventDefault(); actions.fitToWindow(); return }
    if (mod && (key === '=' || key === '+')) { raw.preventDefault(); actions.zoomIn(); return }
    if (mod && key === '-') { raw.preventDefault(); actions.zoomOut(); return }
    if (mod && key === 'a') { raw.preventDefault(); actions.selectAll(); return }
    if (mod && key === 'd') { raw.preventDefault(); actions.deselect(); return }

    // Tool shortcuts (no modifier)
    if (mod || shift) return
    const toolMap = {
      'b': 'brush', 'e': 'eraser', 'v': 'move',
      'm': 'rect-select', 'l': 'lasso', 'w': 'magic-wand',
      'c': 'crop', 'g': 'gradient', 'i': 'eyedropper', 't': 'text', 'u': 'shape',
    }
    if (toolMap[key]) { raw.preventDefault(); state.activeTool = toolMap[key]; return }
    if (key === 'x') { raw.preventDefault(); const tmp = state.fgColor; state.fgColor = state.bgColor; state.bgColor = tmp; return }
    if (key === 'd') { raw.preventDefault(); state.fgColor = '#000000'; state.bgColor = '#ffffff'; return }
    if (key === '[') { raw.preventDefault(); state.brushSize = Math.max(1, state.brushSize - 2); return }
    if (key === ']') { raw.preventDefault(); state.brushSize = Math.min(500, state.brushSize + 2); return }
    if (key === 'Delete' || key === 'Backspace') {
      raw.preventDefault()
      // Clear selection area on active layer
      const layer = state.layers.find(l => l.id === state.activeLayerId)
      if (layer && !layer.locked && state.selection) {
        const ctx = layer.canvas.getContext('2d')
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'
        const { type, bounds } = state.selection
        ctx.fillStyle = 'rgba(0,0,0,1)'
        if (type === 'rect') ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h)
        else if (type === 'ellipse') {
          ctx.beginPath()
          ctx.ellipse(bounds.x + bounds.w/2, bounds.y + bounds.h/2, bounds.w/2, bounds.h/2, 0, 0, Math.PI*2)
          ctx.fill()
        }
        ctx.restore()
        actions.invalidate()
      }
    }
  }
}
