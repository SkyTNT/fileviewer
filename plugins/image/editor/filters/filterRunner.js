import { ALL_FILTERS } from './clientFilters.js'
import { selectionToMask } from '../selectionUtils.js'

const SERVER_FILTERS = new Set(['gaussian_blur', 'unsharp_mask', 'reduce_noise'])
const LARGE_IMAGE_THRESHOLD = 4 * 1024 * 1024  // 4 MP

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

export async function runFilter(filterId, params, layer, editorApi, useServer = null, sel = null) {
  const pixelCount = layer.canvas.width * layer.canvas.height
  const goServer = useServer ?? (SERVER_FILTERS.has(filterId) && pixelCount > LARGE_IMAGE_THRESHOLD)

  if (goServer) {
    const blob = await layer.canvas.convertToBlob({ type: 'image/png' })
    const resultBlob = await editorApi.applyFilter(blob, filterId, params)
    const bitmap = await createImageBitmap(resultBlob)
    const w = layer.canvas.width, h = layer.canvas.height
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
    if (!sel) {
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0)
    } else {
      const mask = selectionToMask(sel, w, h)
      const origData = ctx.getImageData(0, 0, w, h)
      const tmp = new OffscreenCanvas(w, h)
      tmp.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0)
      const filtData = tmp.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h)
      blendMask(ctx, origData, filtData, mask)
    }
    bitmap.close()
  } else {
    const fn = ALL_FILTERS[filterId]
    if (!fn) throw new Error(`Unknown filter: ${filterId}`)
    applyFilterWithSelection((c) => fn(c, params), layer.canvas, sel)
  }
}

export async function previewFilter(filterId, params, layer, sel = null) {
  const preview = new OffscreenCanvas(layer.canvas.width, layer.canvas.height)
  preview.getContext('2d', { willReadFrequently: true }).drawImage(layer.canvas, 0, 0)
  const fn = ALL_FILTERS[filterId]
  if (fn) applyFilterWithSelection((c) => fn(c, params), preview, sel)
  return preview.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height)
}
