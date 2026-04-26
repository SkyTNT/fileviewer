import { ALL_FILTERS } from './clientFilters.js'
import { selectionToMask } from '../selectionUtils.js'

function blendMask(ctx, origData, filtData, mask) {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const p = i * 4
      origData.data[p]   = filtData.data[p]
      origData.data[p+1] = filtData.data[p+1]
      origData.data[p+2] = filtData.data[p+2]
      origData.data[p+3] = filtData.data[p+3]
    }
  }
  ctx.putImageData(origData, 0, 0)
}

// applyFilterWithSelection(fn, canvas, sel)
// applyFilterWithSelection(fn, canvas, params, sel)
export function applyFilterWithSelection(fn, canvas, paramsOrSel, sel) {
  const hasParams = sel !== undefined
  const selection = hasParams ? sel : paramsOrSel
  const call = (c) => hasParams ? fn(c, paramsOrSel) : fn(c)

  if (!selection) { call(canvas); return }

  const w = canvas.width, h = canvas.height
  const mask = selectionToMask(selection, w, h)
  const tmp = new OffscreenCanvas(w, h)
  tmp.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0)
  call(tmp)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const origData = ctx.getImageData(0, 0, w, h)
  const filtData = tmp.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h)
  blendMask(ctx, origData, filtData, mask)
}

export async function runFilter(filterId, params, layer, sel = null) {
  const fn = ALL_FILTERS[filterId]
  if (!fn) throw new Error(`Unknown filter: ${filterId}`)
  applyFilterWithSelection((c) => fn(c, params), layer.canvas, sel)
}

export async function previewFilter(filterId, params, layer, sel = null) {
  const preview = new OffscreenCanvas(layer.canvas.width, layer.canvas.height)
  preview.getContext('2d', { willReadFrequently: true }).drawImage(layer.canvas, 0, 0)
  const fn = ALL_FILTERS[filterId]
  if (fn) applyFilterWithSelection((c) => fn(c, params), preview, sel)
  return preview.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height)
}
