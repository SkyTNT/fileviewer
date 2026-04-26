import { getActiveLayer, createLayer } from './editorState.js'
import { getSelectionImageData, clearSelectionOnLayer, invertSelection } from './selectionUtils.js'
import MoveTool from './tools/MoveTool.js'

export function createKeyboardHandler(state, historyAPI, actions, isFocused) {
  const { undo, redo } = historyAPI

  return function handleKey({ key, ctrl, meta, shift, raw }) {
    if (!isFocused()) return
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const mod = ctrl || meta

    // Transform apply / cancel (Enter / Escape when move tool is transforming)
    if (key === 'Enter' && state.activeTool === 'move' && MoveTool.isTransforming()) {
      raw.preventDefault()
      MoveTool.applyTransform(state, { state, pushHistory: (l) => historyAPI.push(l, state), invalidate: actions.invalidate })
      return
    }
    if (key === 'Escape' && state.activeTool === 'move' && MoveTool.isTransforming()) {
      raw.preventDefault()
      MoveTool.cancelTransform(state, { state, pushHistory: (l) => historyAPI.push(l, state), invalidate: actions.invalidate })
      return
    }

    if (mod && !shift && key === 'z') { raw.preventDefault(); undo(state); actions.invalidate(); return }
    if ((mod && shift && key === 'z') || (mod && !shift && key === 'y')) { raw.preventDefault(); redo(state); actions.invalidate(); return }
    if (mod && !shift && key === 's') { raw.preventDefault(); actions.save(); return }
    if (mod && shift && key === 's') { raw.preventDefault(); actions.saveAs(); return }
    if (mod && !shift && key === 't') {
      raw.preventDefault()
      if (!MoveTool.isTransforming()) {
        state.activeTool = 'move'
        MoveTool.startTransform(state, { state, pushHistory: (l) => historyAPI.push(l, state), invalidate: actions.invalidate })
      }
      return
    }
    if (mod && key === 'e') { raw.preventDefault(); actions.exportDialog(); return }
    if (mod && key === '0') { raw.preventDefault(); actions.fitToWindow(); return }
    if (mod && (key === '=' || key === '+')) { raw.preventDefault(); actions.zoomIn(); return }
    if (mod && key === '-') { raw.preventDefault(); actions.zoomOut(); return }
    if (mod && !shift && key === 'a') { raw.preventDefault(); actions.selectAll(); return }
    if (mod && !shift && key === 'd') { raw.preventDefault(); actions.deselect(); return }
    if (mod && shift && key === 'i') { raw.preventDefault(); actions.invertSelection(); return }

    // Fill selection: Shift+F5 (no mod)
    if (!mod && shift && key === 'F5') { raw.preventDefault(); actions.fillSelection(); return }

    // Copy
    if (mod && !shift && key === 'c') {
      raw.preventDefault()
      const layer = getActiveLayer(state)
      if (!layer) return
      if (state.selection) {
        const extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
        if (extracted) state.clipboard = { imageData: extracted.imageData, w: extracted.w, h: extracted.h, x: extracted.x, y: extracted.y }
      } else {
        const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
        const imgData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height)
        state.clipboard = { imageData: imgData, w: layer.canvas.width, h: layer.canvas.height, x: 0, y: 0 }
      }
      return
    }

    // Cut
    if (mod && !shift && key === 'x') {
      raw.preventDefault()
      const layer = getActiveLayer(state)
      if (!layer || layer.locked) return
      if (state.selection) {
        const extracted = getSelectionImageData(layer, state.selection, state.canvasWidth, state.canvasHeight)
        if (extracted) {
          state.clipboard = { imageData: extracted.imageData, w: extracted.w, h: extracted.h, x: extracted.x, y: extracted.y }
          historyAPI.push('Cut', state)
          clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
          state.isDirty = true
          actions.invalidate()
        }
      } else {
        const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
        const imgData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height)
        state.clipboard = { imageData: imgData, w: layer.canvas.width, h: layer.canvas.height, x: 0, y: 0 }
        historyAPI.push('Cut', state)
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
        state.isDirty = true
        actions.invalidate()
      }
      return
    }

    // Paste as new layer
    if (mod && !shift && key === 'v') {
      raw.preventDefault()
      if (!state.clipboard) return
      const { imageData, w, h, x, y } = state.clipboard
      historyAPI.push('Paste', state)
      const newLayer = createLayer('Pasted', state.canvasWidth, state.canvasHeight)
      const ctx = newLayer.canvas.getContext('2d', { willReadFrequently: true })
      // Center on canvas if pasting from a different size, otherwise use original position
      const px = x ?? Math.round((state.canvasWidth - w) / 2)
      const py = y ?? Math.round((state.canvasHeight - h) / 2)
      ctx.putImageData(imageData, px, py)
      const activeIdx = state.layers.findIndex(l => l.id === state.activeLayerId)
      state.layers.splice(activeIdx + 1, 0, newLayer)
      state.activeLayerId = newLayer.id
      state.isDirty = true
      actions.invalidate()
      return
    }

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
      const layer = getActiveLayer(state)
      if (layer && !layer.locked && state.selection) {
        historyAPI.push('Delete', state)
        clearSelectionOnLayer(layer, state.selection, state.canvasWidth, state.canvasHeight)
        state.isDirty = true
        actions.invalidate()
      }
    }
  }
}
