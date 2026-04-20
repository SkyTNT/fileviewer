import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import TextViewer from './TextViewer.vue'
import JsonViewer from './JsonViewer.vue'
import JsonNode from './JsonNode.vue'
import { createTextApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('text', 'en', en)
  i18n.extend('text', 'zh-CN', zhCN)
  i18n.extend('text', 'zh-TW', zhTW)
  i18n.extend('text', 'ja', ja)

  ctx.services.register('text.api', createTextApi(ctx.services.get('network.http')), 'text')

  const registry = ctx.services.get('app.registry')

  registry.register({
    key: 'json',
    component: markRaw(JsonViewer),
    icon: 'mdi-code-json',
    defaultWidth: 900,
    defaultHeight: 620,
    priority: 10,
    match: (target) => !Array.isArray(target) && ['json', 'jsonl'].includes(target?.type),
  })

  registry.register({
    key: 'text',
    component: markRaw(TextViewer),
    icon: 'mdi-file-document-outline',
    defaultWidth: 1100,
    defaultHeight: 700,
    priority: -10,
    match: (target) => !Array.isArray(target) && target?.type === 'text',
  })

  ctx.services.register('ui.json-node',   markRaw(JsonNode),   'text')
  ctx.services.register('ui.json-viewer', markRaw(JsonViewer), 'text')
}

export async function teardown(ctx) {
  const registry = ctx.services.get('app.registry')
  registry.unregister('json')
  registry.unregister('text')
  ctx.services.unregister('ui.json-node',   'text')
  ctx.services.unregister('ui.json-viewer', 'text')
  ctx.services.unregister('text.api', 'text')
}
