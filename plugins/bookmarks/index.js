import { markRaw, reactive } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import BookmarksList from './BookmarksList.vue'
export { manifest } from './manifest.js'

const LS_KEY = 'fv-bookmarks'

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

export async function setup(ctx) {
  const [explorerSidebar, i18n, toolbar] = await Promise.all([
    ctx.services.getAsync('explorer.sidebar'),
    ctx.services.getAsync('i18n'),
    ctx.services.getAsync('toolbar.registry'),
  ])

  i18n.extend('bookmarks', 'en',    en)
  i18n.extend('bookmarks', 'zh-CN', zhCN)
  i18n.extend('bookmarks', 'zh-TW', zhTW)
  i18n.extend('bookmarks', 'ja',    ja)

  const bookmarks = reactive({
    items: load(),
    add(path, name) {
      if (this.items.find(b => b.path === path)) return
      this.items.push({ path, name })
      localStorage.setItem(LS_KEY, JSON.stringify(this.items))
    },
    remove(path) {
      const idx = this.items.findIndex(b => b.path === path)
      if (idx >= 0) {
        this.items.splice(idx, 1)
        localStorage.setItem(LS_KEY, JSON.stringify(this.items))
      }
    },
    has(path) { return this.items.some(b => b.path === path) },
  })

  ctx.services.register('bookmarks.state', bookmarks, 'bookmarks')
  explorerSidebar.register(BookmarksList, 'bookmarks')

  const explorer = await ctx.services.getAsync('explorer.state')

  toolbar.registerGroup({ id: 'bookmarks', priority: 37, divider: false })
  toolbar.register({
    id: 'bookmark-toggle',
    plugin: 'bookmarks',
    type: 'toggle',
    group: 'bookmarks',
    placement: 'right',
    priority: 10,
    icon: 'mdi-bookmark-outline',
    label: () => bookmarks.has(explorer.currentPath)
      ? i18n.t('bookmarks.remove')
      : i18n.t('bookmarks.add'),
    show: () => !explorer.isAtHome,
    active: () => bookmarks.has(explorer.currentPath),
    execute() {
      const path = explorer.currentPath
      if (bookmarks.has(path)) {
        bookmarks.remove(path)
      } else {
        const crumbs = explorer.breadcrumbs
        const name = crumbs[crumbs.length - 1]?.name ?? path.split('/').filter(Boolean).pop() ?? path
        bookmarks.add(path, name)
      }
    },
  })
}

export async function teardown(ctx) {
  ctx.services.get('explorer.sidebar').unregister('bookmarks')
  ctx.services.get('toolbar.registry').unregisterAll('bookmarks')
  ctx.services.unregister('bookmarks.state', 'bookmarks')
}
