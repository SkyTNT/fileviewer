import { open as openViewer } from '../composables/useViewerRegistry.js'

export default {
  key: 'open',

  detail: {
    icon: (ctx) => ctx.file.is_dir ? 'mdi-folder-open-outline' : 'mdi-open-in-app',
    label: (ctx) => ctx.t('detail.open'),
    color: 'primary',
    showSingle: () => true,
  },

  action: (ctx) => {
    if (ctx.file.is_dir) {
      ctx.store.navigate(ctx.file.path)
      ctx.store.selectEntry(null)
    } else {
      openViewer(ctx.file)
    }
  },
}
