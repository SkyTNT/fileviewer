import { filesApi } from '@/services/api.js'
import { downloadFiles } from '@/utils/download.js'
import { t, file, selection, isTarget } from './ctx.js'

const targets = () =>
  isTarget()
    ? selection().filter(e => !e.is_dir)
    : file() && !file().is_dir
      ? [file()]
      : selection().filter(e => !e.is_dir)

export default {
  key: 'download',

  menu: {
    icon: 'mdi-download-outline',
    label: () => {
      const n = targets().length
      return n > 1 ? t('menu.downloadFiles', { n }) : t('menu.download')
    },
    show: () => targets().length > 0,
  },

  detail: {
    icon: 'mdi-download',
    // Single file: rendered as native <a> link (browser handles the download);
    // multi: rendered as a button that calls action().
    // href returning null signals the component to render a button instead.
    href: () => file() ? filesApi.downloadUrl(file().path) : null,
    downloadAttr: () => file() ? file().name : null,
    label: () => file()
      ? t('detail.download')
      : t('detail.downloadFiles', { n: selection().filter(e => !e.is_dir).length }),
    color: 'secondary',
    showSingle: () => !file().is_dir,
    showMulti: () => selection().filter(e => !e.is_dir).length > 0,
  },

  action: () => downloadFiles(targets()),
}
