import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import HexViewer from './HexViewer.vue'
import { createHexApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('hex', 'en', en)
  i18n.extend('hex', 'zh-CN', zhCN)
  i18n.extend('hex', 'zh-TW', zhTW)
  i18n.extend('hex', 'ja', ja)

  ctx.services.register('hex.api', createHexApi(ctx.services.get('network.http')), 'hex')

  const appRegistry = ctx.services.get('app.registry')
  const winMgr         = ctx.services.get('window.manager')
  appRegistry.register({
    key: 'hex',
    component: markRaw(HexViewer),
    icon: 'mdi-hexadecimal',
    defaultWidth: 760,
    defaultHeight: 560,
    priority: -10,
    match: (target) => !Array.isArray(target) && !target?.is_dir,
  })

  const explorerState = ctx.services.get('explorer.state')
  const sel = () => explorerState.selectedEntries

  ctx.events.on('keyboard:keydown', ({ key, ctrl, raw }) => {
    if (winMgr?.windows.some(w => !w.minimized)) return
    if (!ctrl || key !== 'h') return
    if (sel().length !== 1 || sel()[0]?.is_dir) return
    raw.preventDefault()
    appRegistry.open(sel()[0], { app: 'hex' })
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('hex')
  ctx.services.unregister('hex.api', 'hex')
}
