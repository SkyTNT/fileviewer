import { copyLoading, copyToClipboard } from './clipboard.js'
import { t, file, isTarget } from './ctx.js'

export default {
  key: 'copy-clipboard',

  menu: {
    icon: 'mdi-clipboard-outline',
    label: () => t('menu.copyToClipboard'),
    show: () => !!file() && !file().is_dir && !isTarget(),
  },

  detail: {
    icon: 'mdi-clipboard-outline',
    label: () => t('detail.copyToClipboard'),
    color: 'secondary',
    showSingle: () => !file().is_dir,
    loading: () => copyLoading.value,
  },

  action: () => copyToClipboard(file()),
}
