export default {
  key: 'copy-clipboard',

  menu: {
    icon: 'mdi-clipboard-outline',
    label: (ctx) => ctx.t('menu.copyToClipboard'),
    show: (ctx) => !!ctx.file && !ctx.file.is_dir && !ctx.isTarget,
  },

  detail: {
    icon: 'mdi-clipboard-outline',
    label: (ctx) => ctx.t('detail.copyToClipboard'),
    color: 'secondary',
    showSingle: (ctx) => !ctx.file.is_dir,
    loading: (ctx) => ctx.copyLoading,
  },

  action: (ctx) => ctx.copyToClipboard(),
}
