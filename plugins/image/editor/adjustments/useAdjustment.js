import { inject } from 'vue'
import { getActiveLayer } from '../editorState.js'

// useAdjustment(historyLabel, applyFn, resetFn?)
// applyFn(layer, selection) — sync or async, called for both preview and commit
// resetFn() — resets component-local param refs back to defaults
export function useAdjustment(historyLabel, applyFn, resetFn) {
  const state = inject('editorState')
  const { pushHistory } = inject('editorHistory')
  const { invalidate } = inject('editorInvalidateObj')

  let _snap = null

  function _ctx(layer) {
    return layer.canvas.getContext('2d', { willReadFrequently: true })
  }

  async function preview() {
    const layer = getActiveLayer(state)
    if (!layer) return
    const ctx = _ctx(layer)
    if (!_snap) _snap = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height)
    ctx.putImageData(_snap, 0, 0)
    await applyFn(layer, state.selection)
    invalidate()
  }

  async function apply() {
    const layer = getActiveLayer(state)
    if (!layer) { _snap = null; resetFn?.(); return }
    pushHistory(historyLabel, state)
    if (_snap) _ctx(layer).putImageData(_snap, 0, 0)
    await applyFn(layer, state.selection)
    state.isDirty = true
    invalidate()
    _snap = null
    resetFn?.()
  }

  function cancel() {
    const layer = getActiveLayer(state)
    if (layer && _snap) { _ctx(layer).putImageData(_snap, 0, 0); invalidate() }
    _snap = null
    resetFn?.()
  }

  function getSnap() { return _snap }

  return { preview, apply, cancel, getSnap }
}
