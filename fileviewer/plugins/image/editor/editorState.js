import { reactive, markRaw } from 'vue'

let _layerCounter = 0
export function newLayerId() { return `layer_${++_layerCounter}_${Date.now()}` }

export function createLayer(name, width, height, fill = null) {
  const canvas = markRaw(new OffscreenCanvas(width || 1, height || 1))
  if (fill) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, width, height)
  }
  return reactive({
    id: newLayerId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    canvas,
  })
}

export function createEditorState() {
  return reactive({
    canvasWidth: 0,
    canvasHeight: 0,
    layers: [],
    activeLayerId: null,

    selection: null,  // null | { type: 'rect'|'ellipse'|'lasso'|'mask', bounds: {x,y,w,h}, mask?: Uint8Array }

    fgColor: '#000000',
    bgColor: '#ffffff',

    activeTool: 'brush',

    // Brush/Eraser
    brushSize: 20,
    brushHardness: 0.8,
    brushOpacity: 1.0,
    brushFlow: 1.0,
    eraserSize: 20,
    eraserHardness: 0.5,
    blurSize: 30,
    blurStrength: 0.5,
    smudgeSize: 30,
    smudgeStrength: 0.7,

    // Selection tools
    fillTolerance: 32,
    wandTolerance: 32,
    selectionMode: 'replace',  // replace | add | subtract

    // Text
    textFont: 'Arial',
    textSize: 24,
    textBold: false,
    textItalic: false,

    // Shape
    shapeType: 'rect',  // rect | ellipse | line
    shapeFill: false,
    shapeStroke: true,
    strokeWidth: 2,

    // Gradient
    gradientType: 'linear',  // linear | radial

    // Crop
    cropAspectRatio: null,  // null | [w, h]

    // View
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: false,
    showRulers: true,

    // Clipboard (internal, not system clipboard)
    clipboard: null,  // null | { imageData: ImageData, w: number, h: number }

    // Status
    isDirty: false,
    filePath: '',
    fileName: '',
    paintTick: 0,

    // Cursor in canvas coords (updated by CanvasViewport)
    cursorX: 0,
    cursorY: 0,
    cursorInCanvas: false,
  })
}

export function getActiveLayer(state) {
  return state.layers.find(l => l.id === state.activeLayerId) ?? null
}

export function hexToRgb(hex) {
  const s = hex.replace('#', '')
  if (s.length === 8) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      a: parseInt(s.slice(6, 8), 16),
    }
  }
  const n = parseInt(s, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 }
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) }
}
