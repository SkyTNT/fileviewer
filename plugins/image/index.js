import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import ImageViewer from './ImageViewer.vue'
import ImageComparisonViewer from './ImageComparisonViewer.vue'
import { createImagesApi } from './api.js'
export { manifest } from './manifest.js'

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','tif','avif'])

function isImage(entry) {
  if (!entry?.name) return false
  const ext = entry.name.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('image', 'en', en)
  i18n.extend('image', 'zh-CN', zhCN)
  i18n.extend('image', 'zh-TW', zhTW)
  i18n.extend('image', 'ja', ja)

  const http = ctx.services.get('network.http')
  const imagesApi = createImagesApi(http)
  ctx.services.register('images.api', imagesApi, 'image')
  const registry      = ctx.services.get('app.registry')

  registry.register({
    key: 'image',
    component: markRaw(ImageViewer),
    icon: 'mdi-image-outline',
    defaultWidth: 900,
    defaultHeight: 650,
    overlay: true,
    priority: 50,
    match: (target) => !Array.isArray(target) && isImage(target),
  })

  registry.register({
    key: 'image-compare',
    component: markRaw(ImageComparisonViewer),
    icon: 'mdi-compare',
    defaultWidth: 1000,
    defaultHeight: 650,
    overlay: true,
    match: (target) => Array.isArray(target) && target.length === 2 && target.every(isImage),
  })

  const actionRegistry = ctx.services.get('action.registry')
  const explorerState  = ctx.services.get('explorer.state')
  const sel    = () => explorerState.selectedEntries
  const ctxSel = () => explorerState.ctxSel

  actionRegistry.register({
    id: 'image-compare', plugin: 'image', priority: 1,
    icon: 'mdi-compare', color: undefined,
    label: () => ctx.services.get('i18n').t('action.compareImages'),
    showIn: {
      contextMenu: () => ctxSel().length === 2 && ctxSel().every(isImage),
      detailPanel: () => sel().length === 2 && sel().every(isImage),
    },
    execute: () => registry.open([ctxSel()[0], ctxSel()[1]], { app: 'image-compare' }),
  })
}

export async function teardown(ctx) {
  const registry = ctx.services.get('app.registry')
  registry.unregister('image')
  registry.unregister('image-compare')
  ctx.services.get('action.registry').unregisterAll('image')
  ctx.services.unregister('images.api', 'image')
}
