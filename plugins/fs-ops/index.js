import { markRaw } from 'vue'
import { openConflictDialog } from './dialogs/openConflictDialog.js'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import ClipboardBar    from './ClipboardBar.vue'
import { createWriteState } from './state.js'
import { createWriteApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('fs-ops', 'en', en)
  i18n.extend('fs-ops', 'zh-CN', zhCN)
  i18n.extend('fs-ops', 'zh-TW', zhTW)
  i18n.extend('fs-ops', 'ja', ja)

  const explorerState = ctx.services.get('explorer.state')
  const taskState     = ctx.services.get('task.state')
  const appConfig     = ctx.services.get('app.config')
  const winMgr        = ctx.services.get('window.manager')
  const toolbar       = ctx.services.get('toolbar.registry')
  const http       = ctx.services.get('network.http')
  const httpStream = ctx.services.get('network.httpStream')
  const readSSE    = ctx.services.get('network.sse')
  const writeApi   = createWriteApi(http, httpStream)
  const conflictDialogFn = (conflicts) => openConflictDialog(winMgr, conflicts)
  ctx.services.register('fs-ops.conflict-dialog', conflictDialogFn, 'fs-ops')
  const writeStore    = createWriteState(explorerState, taskState, winMgr, writeApi, readSSE, conflictDialogFn)
  ctx.services.register('write.state', writeStore, 'fs-ops')
  ctx.services.register('write.api', writeApi, 'fs-ops')

  const actionRegistry = ctx.services.get('action.registry')

  const sel       = () => explorerState.selectedEntries
  const ctxSel    = () => explorerState.ctxSel
  const writeMode = () => appConfig.writeMode
  const isAtHome  = () => explorerState.isAtHome

  actionRegistry.register({
    id: 'open', plugin: 'fs-ops', priority: 1,
    icon: 'mdi-open-in-app', color: undefined,
    label: () => ctx.services.get('i18n').t('action.open'),
    showIn: {
      contextMenu: () => ctxSel().length === 1,
      detailPanel: () => sel().length === 1,
    },
    execute: () => {
      const file = ctxSel()[0]
      if (!file) return
      if (file.is_dir) explorerState.navigate(file.path)
      else ctx.services.get('app.registry').open(file)
    },
  })

  actionRegistry.register({
    id: 'rename', plugin: 'fs-ops', priority: 10,
    icon: 'mdi-pencil-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.rename'),
    showIn: {
      contextMenu: () => writeMode() && ctxSel().length === 1,
      detailPanel: () => writeMode() && sel().length === 1,
    },
    execute: () => writeStore.openRename(ctxSel()[0]),
  })

  actionRegistry.register({
    id: 'delete', plugin: 'fs-ops', priority: 20,
    icon: 'mdi-delete-outline', color: 'error',
    label: () => ctx.services.get('i18n').t('action.delete'),
    showIn: {
      contextMenu: () => writeMode() && ctxSel().length >= 1,
      detailPanel: () => writeMode() && sel().length >= 1,
    },
    execute: () => writeStore.openDelete(ctxSel()),
  })

  actionRegistry.register({
    id: 'mkdir', plugin: 'fs-ops', priority: 30,
    icon: 'mdi-folder-plus-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.newFolder'),
    showIn: {
      contextMenu: () => writeMode() && !isAtHome() && explorerState.contextMenuFile == null,
      detailPanel: () => false,
    },
    execute: () => writeStore.openMkdir(),
  })

  actionRegistry.register({
    id: 'touch', plugin: 'fs-ops', priority: 35,
    icon: 'mdi-file-plus-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.newFile'),
    showIn: {
      contextMenu: () => writeMode() && !isAtHome() && explorerState.contextMenuFile == null,
      detailPanel: () => false,
    },
    execute: () => writeStore.openTouch(),
  })

  actionRegistry.register({
    id: 'copy', plugin: 'fs-ops', priority: 40,
    pairGroup: 'clipboard-copy',
    icon: 'mdi-content-copy', color: undefined,
    label: () => ctx.services.get('i18n').t('action.copy'),
    showIn: {
      contextMenu: () => writeMode() && ctxSel().length >= 1,
      detailPanel: () => writeMode() && sel().length >= 1,
    },
    execute: () => explorerState.setCopy(ctxSel()),
  })

  actionRegistry.register({
    id: 'cut', plugin: 'fs-ops', priority: 45,
    icon: 'mdi-content-cut', color: undefined,
    label: () => ctx.services.get('i18n').t('action.cut'),
    showIn: {
      contextMenu: () => writeMode() && ctxSel().length >= 1,
      detailPanel: () => writeMode() && sel().length >= 1,
    },
    execute: () => explorerState.setCut(ctxSel()),
  })

  actionRegistry.register({
    id: 'paste', plugin: 'fs-ops', priority: 50,
    icon: 'mdi-content-paste', color: 'primary',
    label: () => ctx.services.get('i18n').t('action.paste'),
    showIn: {
      contextMenu: () => writeMode() && explorerState.clipboard != null && !isAtHome(),
      detailPanel: () => writeMode() && explorerState.clipboard != null && !isAtHome(),
    },
    execute: () => writeStore.doPaste(),
  })

  actionRegistry.register({
    id: 'download', plugin: 'fs-ops', priority: 60,
    icon: 'mdi-download-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.download'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && !ctxSel()[0]?.is_dir,
      detailPanel: () => sel().length === 1 && !sel()[0]?.is_dir,
    },
    execute: () => {
      const path = ctxSel()[0]?.path
      if (path) window.open(ctx.services.get('files.api').downloadUrl(path))
    },
  })

  actionRegistry.register({
    id: 'copy-link', plugin: 'fs-ops', priority: 41,
    pairGroup: 'clipboard-copy',
    icon: 'mdi-link-variant', color: undefined,
    label: () => ctx.services.get('i18n').t('action.copyLink'),
    showIn: {
      contextMenu: () => writeMode() && ctxSel().length >= 1,
      detailPanel: () => writeMode() && sel().length >= 1,
    },
    execute: () => explorerState.setCopyLink(ctxSel()),
  })

  toolbar.register({
    id: 'mkdir-button', plugin: 'fs-ops',
    type: 'button', group: 'actions', placement: 'right', priority: 30,
    icon: 'mdi-folder-plus-outline',
    label: () => ctx.services.get('i18n').t('action.newFolder'),
    hideOnMobile: true,
    show: () => writeMode() && !isAtHome(),
    execute: () => writeStore.openMkdir(),
  })

  toolbar.register({
    id: 'clipboard-bar', plugin: 'fs-ops',
    type: 'custom', group: 'actions', placement: 'right', priority: 50,
    component: markRaw(ClipboardBar),
    hideOnMobile: true,
    show: () => true,
  })

  ctx.events.on('keyboard:keydown', ({ key, ctrl, meta, raw }) => {
    const mod = ctrl || meta
    if (mod && key === 'c' && sel().length > 0 && !window.getSelection()?.toString()) {
      raw.preventDefault(); explorerState.setCopy(sel())
    } else if (mod && key === 'x' && writeMode() && sel().length > 0) {
      raw.preventDefault(); explorerState.setCut(sel())
    } else if (mod && key === 'v' && writeMode() && explorerState.clipboard && !isAtHome()) {
      raw.preventDefault(); writeStore.doPaste()
    } else if (key === 'Delete' && writeMode() && sel().length > 0 && !isAtHome()) {
      raw.preventDefault(); writeStore.openDelete(sel())
    } else if (key === 'F2' && sel().length === 1) {
      raw.preventDefault(); writeStore.openRename(sel()[0])
    }
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.unregister('fs-ops.conflict-dialog', 'fs-ops')
  ctx.services.unregister('write.state', 'fs-ops')
  ctx.services.unregister('write.api', 'fs-ops')
  ctx.services.get('action.registry').unregisterAll('fs-ops')
  ctx.services.get('toolbar.registry').unregister('mkdir-button')
  ctx.services.get('toolbar.registry').unregister('clipboard-bar')
}
