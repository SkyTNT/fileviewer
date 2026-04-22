import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import ArchiveViewer from './ArchiveViewer.vue'
import { createArchiveState } from './state.js'
import { createArchiveApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('archive', 'en', en)
  i18n.extend('archive', 'zh-CN', zhCN)
  i18n.extend('archive', 'zh-TW', zhTW)
  i18n.extend('archive', 'ja', ja)

  const registry      = ctx.services.get('app.registry')
  const explorerState = ctx.services.get('explorer.state')
  const taskState     = ctx.services.get('task.state')
  const appConfig     = ctx.services.get('app.config')
  const winMgr        = ctx.services.get('window.manager')
  const writeApi      = ctx.services.get('write.api')
  const http          = ctx.services.get('network.http')
  const httpStream    = ctx.services.get('network.httpStream')
  const readSSE            = ctx.services.get('network.sse')
  const openConflictDialog = ctx.services.get('fs-ops.conflict-dialog')
  const archiveApi         = createArchiveApi(http, httpStream)
  const archiveState       = createArchiveState(explorerState, taskState, winMgr, archiveApi, writeApi, readSSE, openConflictDialog)
  ctx.services.register('archive.state', archiveState, 'archive')
  ctx.services.register('archive.api', archiveApi, 'archive')

  registry.register({
    key: 'archive',
    icon: 'mdi-archive-outline',
    priority: 10,
    match: (target) => !Array.isArray(target) && target?.type === 'archive',
    open(target) {
      const id = `app:archive:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-archive-outline', component: markRaw(ArchiveViewer), props: { file: target }, width: 1000, height: 680, maximized: false })
      return id
    },
  })

  const actionRegistry = ctx.services.get('action.registry')
  const sel    = () => explorerState.selectedEntries
  const ctxSel = () => explorerState.ctxSel
  const writeMode = () => appConfig.writeMode

  actionRegistry.register({
    id: 'compress', plugin: 'archive', priority: 70,
    icon: 'mdi-archive-arrow-down-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.compress'),
    showIn: {
      contextMenu: () => ctxSel().length >= 1 && writeMode(),
      detailPanel: () => sel().length >= 1 && writeMode(),
    },
    execute: () => archiveState.openCompress(ctxSel()),
  })

  actionRegistry.register({
    id: 'extract-here', plugin: 'archive', priority: 75,
    icon: 'mdi-archive-arrow-up-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.extractHere'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && ctxSel()[0]?.type === 'archive',
      detailPanel: () => sel().length === 1 && sel()[0]?.type === 'archive',
    },
    execute: () => archiveState.extractHere(ctxSel()[0]),
  })

  actionRegistry.register({
    id: 'extract-subfolder', plugin: 'archive', priority: 80,
    icon: 'mdi-folder-arrow-up-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.extractSubfolder'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && ctxSel()[0]?.type === 'archive',
      detailPanel: () => sel().length === 1 && sel()[0]?.type === 'archive',
    },
    execute: () => archiveState.extractToSubfolder(ctxSel()[0]),
  })

  ctx.events.on('keyboard:keydown', ({ key, ctrl, shift, raw }) => {
    if (winMgr?.hasVisibleWindow) return
    if (!ctrl || !shift || key !== 'C') return
    if (!writeMode() || sel().length === 0) return
    raw.preventDefault()
    archiveState.openCompress(sel())
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('archive')
  ctx.services.get('action.registry').unregisterAll('archive')
  ctx.services.unregister('archive.state', 'archive')
  ctx.services.unregister('archive.api', 'archive')
}
