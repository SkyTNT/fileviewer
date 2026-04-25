import { ALL_FILTERS } from './clientFilters.js'

const SERVER_FILTERS = new Set(['gaussian_blur', 'unsharp_mask', 'reduce_noise'])
const LARGE_IMAGE_THRESHOLD = 4 * 1024 * 1024  // 4 MP

export async function runFilter(filterId, params, layer, editorApi, useServer = null) {
  const pixelCount = layer.canvas.width * layer.canvas.height
  const goServer = useServer ?? (SERVER_FILTERS.has(filterId) && pixelCount > LARGE_IMAGE_THRESHOLD)

  if (goServer) {
    const blob = await layer.canvas.convertToBlob({ type: 'image/png' })
    const resultBlob = await editorApi.applyFilter(blob, filterId, params)
    const bitmap = await createImageBitmap(resultBlob)
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
  } else {
    const fn = ALL_FILTERS[filterId]
    if (!fn) throw new Error(`Unknown filter: ${filterId}`)
    fn(layer.canvas, params)
  }
}

// Generate a preview ImageData without modifying the original canvas
export async function previewFilter(filterId, params, layer) {
  const preview = new OffscreenCanvas(layer.canvas.width, layer.canvas.height)
  preview.getContext('2d', { willReadFrequently: true }).drawImage(layer.canvas, 0, 0)
  const fn = ALL_FILTERS[filterId]
  if (fn) fn(preview, params)
  return preview.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, preview.width, preview.height)
}
