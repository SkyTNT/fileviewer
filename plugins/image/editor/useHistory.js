import { reactive, markRaw } from 'vue'

export function createHistory(maxSteps = 50) {
  const store = reactive({ steps: [], currentIndex: -1 })

  const canUndo = () => store.currentIndex > 0
  const canRedo = () => store.currentIndex < store.steps.length - 1

  function snapshotLayers(layers, activeLayerId, selection, canvasWidth, canvasHeight) {
    return {
      activeLayerId,
      canvasWidth,
      canvasHeight,
      selection: selection
        ? { type: selection.type, bounds: { ...selection.bounds }, mask: selection.mask ? new Uint8Array(selection.mask) : null }
        : null,
      layers: layers.map(l => ({
        id: l.id, name: l.name, visible: l.visible, locked: l.locked,
        opacity: l.opacity, blendMode: l.blendMode,
        imageData: l.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, l.canvas.width, l.canvas.height),
      })),
    }
  }

  function push(label, state) {
    if (store.currentIndex < store.steps.length - 1)
      store.steps.splice(store.currentIndex + 1)
    if (store.steps.length >= maxSteps) store.steps.shift()
    store.steps.push({ label, snapshot: snapshotLayers(state.layers, state.activeLayerId, state.selection, state.canvasWidth, state.canvasHeight) })
    store.currentIndex = store.steps.length - 1
  }

  function restoreSnapshot(snapshot, state) {
    const existingMap = new Map(state.layers.map(l => [l.id, l]))
    const newLayers = snapshot.layers.map(s => {
      let layer = existingMap.get(s.id)
      const iw = s.imageData.width, ih = s.imageData.height
      if (!layer || layer.canvas.width !== iw || layer.canvas.height !== ih) {
        layer = {
          id: s.id, name: s.name, visible: s.visible, locked: s.locked,
          opacity: s.opacity, blendMode: s.blendMode,
          canvas: markRaw(new OffscreenCanvas(iw, ih)),
        }
      } else {
        layer.name = s.name; layer.visible = s.visible; layer.locked = s.locked
        layer.opacity = s.opacity; layer.blendMode = s.blendMode
      }
      layer.canvas.getContext('2d', { willReadFrequently: true }).putImageData(s.imageData, 0, 0)
      return layer
    })
    state.layers.splice(0, state.layers.length, ...newLayers)
    state.activeLayerId = snapshot.activeLayerId
    state.canvasWidth = snapshot.canvasWidth
    state.canvasHeight = snapshot.canvasHeight
    state.selection = snapshot.selection
      ? { type: snapshot.selection.type, bounds: { ...snapshot.selection.bounds }, mask: snapshot.selection.mask }
      : null
  }

  function undo(state) {
    if (!canUndo()) return
    store.currentIndex--
    restoreSnapshot(store.steps[store.currentIndex].snapshot, state)
    state.isDirty = true
  }

  function redo(state) {
    if (!canRedo()) return
    store.currentIndex++
    restoreSnapshot(store.steps[store.currentIndex].snapshot, state)
    state.isDirty = true
  }

  function jumpTo(index, state) {
    if (index < 0 || index >= store.steps.length) return
    store.currentIndex = index
    restoreSnapshot(store.steps[index].snapshot, state)
    state.isDirty = true
  }

  return { store, push, undo, redo, jumpTo, canUndo, canRedo }
}
