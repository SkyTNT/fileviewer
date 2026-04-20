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

  const winMgr   = ctx.services.get('window.manager')
  const registry = ctx.services.get('app.registry')

  registry.register({
    key: 'json',
    icon: 'mdi-code-json',
    priority: 10,
    match: (target) => !Array.isArray(target) && ['json', 'jsonl'].includes(target?.type),
    open(target) {
      const id = `app:json:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-code-json', component: markRaw(JsonViewer), props: { file: target }, width: 900, height: 620, maximized: false })
      return id
    },
  })

  registry.register({
    key: 'text',
    icon: 'mdi-file-document-outline',
    priority: -10,
    match: (target) => !Array.isArray(target) && target?.type === 'text',
    open(target) {
      const id = `app:text:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-file-document-outline', component: markRaw(TextViewer), props: { file: target }, width: 1100, height: 700, maximized: false })
      return id
    },
  })

  ctx.services.register('text.json-node',   markRaw(JsonNode),   'text')
  ctx.services.register('text.json-viewer', markRaw(JsonViewer), 'text')
}

export async function teardown(ctx) {
  const registry = ctx.services.get('app.registry')
  registry.unregister('json')
  registry.unregister('text')
  ctx.services.unregister('text.json-node',   'text')
  ctx.services.unregister('text.json-viewer', 'text')
  ctx.services.unregister('text.api', 'text')
}
