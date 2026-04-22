import { markRaw } from 'vue'
import OpenWithDialog from './OpenWithDialog.vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = await ctx.services.getAsync('i18n')
  i18n.extend('open-with', 'en', en)
  i18n.extend('open-with', 'zh-CN', zhCN)
  i18n.extend('open-with', 'zh-TW', zhTW)
  i18n.extend('open-with', 'ja', ja)

  const [appRegistry, actionRegistry, winMgr, explorerState] = await Promise.all([
    ctx.services.getAsync('app.registry'),
    ctx.services.getAsync('action.registry'),
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('explorer.state'),
  ])

  const ctxSel = () => explorerState.ctxSel
  const sel    = () => explorerState.selectedEntries

  actionRegistry.register({
    id: 'open-with', plugin: 'open-with', priority: 85,
    icon: 'mdi-application-edit-outline',
    label: () => ctx.services.get('i18n').t('action.openAs'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && !ctxSel()[0]?.is_dir,
      detailPanel: () => sel().length === 1 && !sel()[0]?.is_dir,
    },
    execute: () => {
      const file = ctxSel()[0] ?? explorerState.selectedEntry
      if (!file) return
      winMgr.open({
        id: `dialog:open-with:${file.path}`,
        title: file.name,
        icon: 'mdi-application-edit-outline',
        component: markRaw(OpenWithDialog),
        width: 280,
        height: 400,
        props: { file },
      })
    },
  })
}

export async function teardown(ctx) {
  ctx.services.get('action.registry').unregisterAll('open-with')
}
