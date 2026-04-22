import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import UploadTrigger from './UploadTrigger.vue'
import { createUploadState } from './state.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('upload', 'en', en)
  i18n.extend('upload', 'zh-CN', zhCN)
  i18n.extend('upload', 'zh-TW', zhTW)
  i18n.extend('upload', 'ja', ja)

  const explorerState = ctx.services.get('explorer.state')
  const taskState     = ctx.services.get('task.state')
  const appConfig     = ctx.services.get('app.config')
  const winMgr        = ctx.services.get('window.manager')
  const toolbar       = ctx.services.get('toolbar.registry')
  const slotHost      = ctx.services.get('slot.host')
  const writeApi           = ctx.services.get('write.api')
  const openConflictDialog = ctx.services.get('fs-ops.conflict-dialog')
  const uploadState        = createUploadState(explorerState, taskState, winMgr, writeApi, openConflictDialog)
  ctx.services.register('upload.state', uploadState, 'upload')

  slotHost.inject('windows', markRaw(UploadTrigger), 'upload')

  toolbar.register({
    id: 'upload-button', plugin: 'upload',
    type: 'button', group: 'actions', placement: 'right', priority: 20,
    icon: 'mdi-upload',
    label: () => ctx.services.get('i18n').t('toolbar.upload'),
    hideOnMobile: true,
    show: () => appConfig.writeMode && !explorerState.isAtHome,
    execute: () => ctx.events.emit('upload:trigger'),
  })

  ctx.events.on('keyboard:keydown', ({ key, ctrl, raw }) => {
    if (winMgr?.hasVisibleWindow) return
    if (!ctrl || key !== 'u') return
    if (!appConfig.writeMode || explorerState.isAtHome) return
    raw.preventDefault()
    ctx.events.emit('upload:trigger')
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.get('slot.host').remove('windows', 'upload')
  ctx.services.get('toolbar.registry').unregister('upload-button')
  ctx.services.unregister('upload.state', 'upload')
}
