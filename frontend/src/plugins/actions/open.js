import { useFileStore } from '@/plugins/file/store.js'
import { useViewerStore } from '@/plugins/viewer/store.js'
import { t, file } from './ctx.js'

export default {
  key: 'open',

  detail: {
    icon: () => file().is_dir ? 'mdi-folder-open-outline' : 'mdi-open-in-app',
    label: () => t('detail.open'),
    color: 'primary',
    showSingle: () => true,
  },

  action: () => {
    const f = file()
    if (f.is_dir) {
      const store = useFileStore()
      store.navigate(f.path)
      store.selectEntry(null)
    } else {
      useViewerStore().open(f)
    }
  },
}
