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
  let _previewPending = false
  let _previewRunning = false
  let _abortPreview = false

  function _ctx(layer) {
    return layer.canvas.getContext('2d', { willReadFrequently: true })
  }

  async function _runPreview() {
    _previewRunning = true
    while (_previewPending) {
      _previewPending = false
      const layer = getActiveLayer(state)
      if (!layer) break
      const ctx = _ctx(layer)
      if (!_snap) _snap = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height)
      ctx.putImageData(_snap, 0, 0)
      await applyFn(layer, state.selection)
      if (_abortPreview) break
      invalidate()
    }
    _previewRunning = false
  }

  function preview() {
    _previewPending = true
    if (!_previewRunning) _runPreview()
  }

  async function apply() {
    _abortPreview = true
    _previewPending = false
    while (_previewRunning) await new Promise(r => setTimeout(r, 0))
    _abortPreview = false
    const layer = getActiveLayer(state)
    if (!layer) { _snap = null; resetFn?.(); return }
    if (_snap) _ctx(layer).putImageData(_snap, 0, 0)
    await applyFn(layer, state.selection)
    pushHistory(historyLabel, state)
    state.isDirty = true
    invalidate()
    _snap = null
    resetFn?.()
  }

  async function cancel() {
    _abortPreview = true
    _previewPending = false
    while (_previewRunning) await new Promise(r => setTimeout(r, 0))
    _abortPreview = false
    const layer = getActiveLayer(state)
    if (layer && _snap) { _ctx(layer).putImageData(_snap, 0, 0); invalidate() }
    _snap = null
    resetFn?.()
  }

  function getSnap() { return _snap }

  return { preview, apply, cancel, getSnap }
}
