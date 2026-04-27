import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import ImageViewer from './ImageViewer.vue'
import ImageComparisonViewer from './ImageComparisonViewer.vue'
import ImageEditor from './ImageEditor.vue'
import ImageMetaSection from './ImageMetaSection.vue'
import { createImagesApi } from './api.js'
export { manifest } from './manifest.js'

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','tif','avif','psd'])

function isImage(entry) {
  if (!entry?.name) return false
  const ext = entry.name.split('.').pop()?.toLowerCase()
  return IMAGE_EXTS.has(ext)
}

export async function setup(ctx) {
  const i18n = await ctx.services.getAsync('i18n')
  i18n.extend('image', 'en', en)
  i18n.extend('image', 'zh-CN', zhCN)
  i18n.extend('image', 'zh-TW', zhTW)
  i18n.extend('image', 'ja', ja)

  const ft = await ctx.services.getAsync('file.types')
  ft.registerDetailSection('image', {
    id: 'image-json-meta',
    component: markRaw(ImageMetaSection),
    propsFor: (entry) => entry.meta_path ? { file: entry } : null,
  }, 'image')

  const [http, winMgr, registry] = await Promise.all([
    ctx.services.getAsync('network.http'),
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('app.registry'),
  ])
  const imagesApi = createImagesApi(http)
  ctx.services.register('images.api', imagesApi, 'image')

  registry.register({
    key: 'image',
    icon: 'mdi-image-outline',
    priority: 50,
    match: (target) => !Array.isArray(target) && isImage(target),
    open(target) {
      const id = `app:image:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-image-outline', component: markRaw(ImageViewer), props: { file: target }, width: 900, height: 650, maximized: true })
      return id
    },
  })

  registry.register({
    key: 'image-compare',
    icon: 'mdi-compare',
    match: (target) => Array.isArray(target) && target.length === 2 && target.every(isImage),
    open(target) {
      const id = `app:image-compare:${target[0].path}|${target[1].path}`
      winMgr.open({ id, title: `${target[0].name} / ${target[1].name}`, icon: 'mdi-compare', component: markRaw(ImageComparisonViewer), props: { file: target }, width: 1000, height: 650, maximized: true })
      return id
    },
  })

  // Register image editor app
  registry.register({
    key: 'image-editor',
    icon: 'mdi-image-edit-outline',
    priority: 49,
    match: (target) => !Array.isArray(target) && isImage(target) && !target.path?.startsWith('http'),
    open(target) {
      const id = `app:image-editor:${target.path}`
      winMgr.open({
        id, title: `Edit — ${target.name}`,
        icon: 'mdi-image-edit-outline',
        component: markRaw(ImageEditor),
        props: { file: target },
        width: 1400, height: 900, maximized: true,
      })
      return id
    },
  })

  const [actionRegistry, explorerState] = await Promise.all([
    ctx.services.getAsync('action.registry'),
    ctx.services.getAsync('explorer.state'),
  ])
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

  actionRegistry.register({
    id: 'image-edit', plugin: 'image', priority: 2,
    icon: 'mdi-image-edit-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.editImage'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && isImage(ctxSel()[0]) && !ctxSel()[0].path?.startsWith('http'),
      detailPanel: () => sel().length === 1 && isImage(sel()[0]) && !sel()[0].path?.startsWith('http'),
    },
    execute: () => registry.open(ctxSel()[0], { app: 'image-editor' }),
  })
}

export async function teardown(ctx) {
  const registry = ctx.services.get('app.registry')
  registry.unregister('image')
  registry.unregister('image-compare')
  registry.unregister('image-editor')
  ctx.services.get('action.registry').unregisterAll('image')
  ctx.services.unregister('images.api', 'image')
  ctx.services.get('file.types').unregisterDetailSections('image')
}
