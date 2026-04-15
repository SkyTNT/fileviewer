import { filesApi } from '../services/api.js'
import { downloadFiles } from '../utils/download.js'

// Files to download: multi-target selection → selected files; otherwise → [file] or selection
const targets = (ctx) =>
  ctx.isTarget
    ? ctx.selection.filter(e => !e.is_dir)
    : ctx.file && !ctx.file.is_dir
      ? [ctx.file]
      : ctx.selection.filter(e => !e.is_dir)

export default {
  key: 'download',

  menu: {
    icon: 'mdi-download-outline',
    label: (ctx) => {
      const n = targets(ctx).length
      return n > 1 ? ctx.t('menu.downloadFiles', { n }) : ctx.t('menu.download')
    },
    show: (ctx) => targets(ctx).length > 0,
  },

  detail: {
    icon: 'mdi-download',
    // Single file: rendered as native <a> link (browser handles the download);
    // multi: rendered as a button that calls action().
    // href returning null signals the component to render a button instead.
    href: (ctx) => ctx.file ? filesApi.downloadUrl(ctx.file.path) : null,
    downloadAttr: (ctx) => ctx.file ? ctx.file.name : null,
    label: (ctx) => ctx.file
      ? ctx.t('detail.download')
      : ctx.t('detail.downloadFiles', { n: ctx.selection.filter(e => !e.is_dir).length }),
    color: 'secondary',
    showSingle: (ctx) => !ctx.file.is_dir,
    showMulti: (ctx) => ctx.selection.filter(e => !e.is_dir).length > 0,
  },

  action: (ctx) => downloadFiles(targets(ctx)),
}
