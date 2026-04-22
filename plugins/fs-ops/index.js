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
  const i18n = await ctx.services.getAsync('i18n')
  i18n.extend('fs-ops', 'en', en)
  i18n.extend('fs-ops', 'zh-CN', zhCN)
  i18n.extend('fs-ops', 'zh-TW', zhTW)
  i18n.extend('fs-ops', 'ja', ja)

  const [explorerState, taskState, appConfig, winMgr, toolbar, http, httpStream, readSSE] =
    await Promise.all([
      ctx.services.getAsync('explorer.state'),
      ctx.services.getAsync('task.state'),
      ctx.services.getAsync('app.config'),
      ctx.services.getAsync('window.manager'),
      ctx.services.getAsync('toolbar.registry'),
      ctx.services.getAsync('network.http'),
      ctx.services.getAsync('network.httpStream'),
      ctx.services.getAsync('network.sse'),
    ])
  const writeApi   = createWriteApi(http, httpStream)
  const conflictDialogFn = (conflicts) => openConflictDialog(winMgr, conflicts)
  ctx.services.register('fs-ops.conflict-dialog', conflictDialogFn, 'fs-ops')
  const writeStore    = createWriteState(explorerState, taskState, winMgr, writeApi, readSSE, conflictDialogFn, i18n)
  ctx.services.register('write.state', writeStore, 'fs-ops')
  ctx.services.register('write.api', writeApi, 'fs-ops')

  const actionRegistry = await ctx.services.getAsync('action.registry')

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
      contextMenu: () => ctxSel().length >= 1 && ctxSel().some(f => !f.is_dir),
      detailPanel: () => sel().length >= 1 && sel().some(f => !f.is_dir),
    },
    execute: () => {
      const filesApi = ctx.services.get('files.api')
      ctxSel().filter(f => !f.is_dir).forEach(f => {
        const a = document.createElement('a')
        a.href = filesApi.downloadUrl(f.path)
        a.download = f.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      })
    },
  })

  actionRegistry.register({
    id: 'copy-content', plugin: 'fs-ops', priority: 61,
    icon: 'mdi-clipboard-outline', color: undefined,
    label: () => ctx.services.get('i18n').t('action.copyContent'),
    showIn: {
      contextMenu: () => ctxSel().length === 1 && !ctxSel()[0]?.is_dir,
      detailPanel: () => sel().length === 1 && !sel()[0]?.is_dir,
    },
    execute: async () => {
      const f = ctxSel()[0]
      if (!f) return
      const notify = ctx.services.get('notification.show')
      const i18n = ctx.services.get('i18n')
      try {
        if (f.type === 'image') {
          const { data: blob } = await http.get('/files/download', { params: { path: f.path }, responseType: 'blob' })
          const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob)
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
        } else {
          const { data } = await ctx.services.get('text.api').getContent(f.path)
          await navigator.clipboard.writeText(data.content)
        }
        notify.success(i18n.t('notify.copiedToClipboard'))
      } catch (e) {
        const msg = e?.response?.status === 415
          ? i18n.t('notify.binaryFileError')
          : String(e)
        notify.error(msg)
      }
    },
  })

  function convertToPng(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
        URL.revokeObjectURL(img.src)
      }
      img.onerror = reject
      img.src = URL.createObjectURL(blob)
    })
  }

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
    if (winMgr?.hasVisibleWindow) return
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
