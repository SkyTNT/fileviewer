import { ref } from 'vue'
import i18n from '@/plugins/i18n.js'
import { imagesApi, filesApi } from '@/services/api.js'
import { useNotificationStore } from '@/plugins/notification/store.js'

const TEXT_SIZE_LIMIT  = 5  * 1024 * 1024  // 5 MB
const IMAGE_SIZE_LIMIT = 20 * 1024 * 1024  // 20 MB

async function copyFileToClipboard(file) {
  const size = file.size ?? 0
  if (file.type === 'image') {
    if (size > IMAGE_SIZE_LIMIT) throw new Error('Image too large (max 20 MB)')
    let blob = (await imagesApi.full(file.path)).data
    if (blob.type !== 'image/png') {
      const bmp    = await createImageBitmap(blob)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      canvas.getContext('2d').drawImage(bmp, 0, 0)
      blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } else {
    if (size > TEXT_SIZE_LIMIT) throw new Error('File too large (max 5 MB)')
    const bytes = new Uint8Array((await filesApi.download(file.path)).data)
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) throw new Error('Cannot copy binary file to clipboard')
    }
    let text
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('Cannot copy binary file to clipboard')
    }
    await navigator.clipboard.writeText(text)
  }
}

// Module-level singleton — shared across all callers.
export const copyLoading = ref(false)

export async function copyToClipboard(file) {
  const { showError, showSuccess } = useNotificationStore()
  copyLoading.value = true
  try {
    await copyFileToClipboard(file)
    showSuccess(i18n.global.t('notify.copiedToClipboard'))
  } catch (e) {
    showError(e.message)
  } finally {
    copyLoading.value = false
  }
}
