import { markRaw, reactive } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import ExplorerSidebar from './ExplorerSidebar.vue'
import ExplorerAppBar  from './ExplorerAppBar.vue'
import ExplorerContent from './ExplorerContent.vue'
import BreadcrumbBar   from './components/BreadcrumbBar.vue'
import FilterButton    from './components/FilterButton.vue'
import SettingsMenu    from './components/SettingsMenu.vue'
import EntryCount      from './components/EntryCount.vue'
import MobileMenu      from './components/MobileMenu.vue'
import WriteModeChip   from './components/WriteModeChip.vue'
import { createExplorerState } from './state.js'
import { useRubberBand }       from './useRubberBand.js'
import { useContextMenu }      from './useContextMenu.js'
import { useExplorerKeyboard } from './useExplorerKeyboard.js'
import ContextMenu             from './components/ContextMenu.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const [slotHost, appConfig, i18n] = await Promise.all([
    ctx.services.getAsync('slot.host'),
    ctx.services.getAsync('app.config'),
    ctx.services.getAsync('i18n'),
  ])

  i18n.extend('explorer', 'en', en)
  i18n.extend('explorer', 'zh-CN', zhCN)
  i18n.extend('explorer', 'zh-TW', zhTW)
  i18n.extend('explorer', 'ja', ja)

  await appConfig.load()

  const filesApi      = await ctx.services.getAsync('files.api')
  const explorerState = createExplorerState(filesApi)
  explorerState.writeMode = appConfig.writeMode
  explorerState.roots     = appConfig.roots

  const sidebarRegistry = reactive({
    _sections: [],
    register(component, pluginId, props = {}) {
      this._sections.push({ component: markRaw(component), pluginId, props, key: `${pluginId}:sidebar` })
    },
    unregister(pluginId) {
      this._sections = this._sections.filter(s => s.pluginId !== pluginId)
    },
    get sections() { return this._sections },
  })
  ctx.services.register('explorer.sidebar', sidebarRegistry, 'explorer')
  ctx.services.register('explorer.state', explorerState, 'explorer')
  ctx.services.register('explorer.useRubberBand', useRubberBand, 'explorer')
  ctx.services.register('explorer.useContextMenu', useContextMenu, 'explorer')
  ctx.services.register('explorer.useExplorerKeyboard', useExplorerKeyboard, 'explorer')
  ctx.services.register('explorer.ContextMenu', markRaw(ContextMenu), 'explorer')

  await explorerState.init()

  ctx.events.on('auth:logged-in', async () => {
    await appConfig.load()
    explorerState.writeMode = appConfig.writeMode
    explorerState.roots     = appConfig.roots
    await explorerState.init()
  }, ctx.pluginId)

  slotHost.inject('sidebar.top', markRaw(ExplorerSidebar), 'explorer')
  slotHost.inject('toolbar', markRaw(ExplorerAppBar), 'explorer')
  slotHost.inject('content.layout', markRaw(ExplorerContent), 'explorer')

  const toolbar = await ctx.services.getAsync('toolbar.registry')
  toolbar.registerGroup({ id: 'nav',      priority: 10, divider: false })
  toolbar.registerGroup({ id: 'actions',  priority: 35, divider: false })
  toolbar.registerGroup({ id: 'view',     priority: 30, divider: false })
  toolbar.registerGroup({ id: 'layout',   priority: 40, divider: false })
  toolbar.registerGroup({ id: 'settings', priority: 50, divider: false })

  toolbar.register({
    id: 'breadcrumb', plugin: 'explorer',
    type: 'custom', group: 'nav', placement: 'left', priority: 10,
    component: markRaw(BreadcrumbBar),
    show: () => true,
  })

  const SORT_OPTIONS = [
    { id: 'sort-name',     icon: 'mdi-sort-alphabetical-variant',      label: () => i18n.t('toolbar.sortName'),     field: 'name' },
    { id: 'sort-size',     icon: 'mdi-sort-numeric-variant',           label: () => i18n.t('toolbar.sortSize'),     field: 'size' },
    { id: 'sort-modified', icon: 'mdi-sort-clock-ascending-outline',   label: () => i18n.t('toolbar.sortModified'), field: 'modified' },
    { id: 'sort-type',     icon: 'mdi-file-outline',                   label: () => i18n.t('toolbar.sortType'),     field: 'type' },
  ]

  toolbar.register({
    id: 'sort-menu', plugin: 'explorer',
    type: 'dropdown', group: 'view', placement: 'right', priority: 20,
    icon: 'mdi-sort',
    label: () => i18n.t('toolbar.sort'),
    hideOnMobile: true,
    active: () => explorerState.sortBy !== 'name' || explorerState.sortOrder !== 'asc',
    items: () => [
      ...SORT_OPTIONS.map(opt => ({
        id: opt.id,
        icon: opt.icon,
        label: opt.label(),
        active: () => explorerState.sortBy === opt.field,
        appendIcon: () => explorerState.sortBy === opt.field
          ? (explorerState.sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down')
          : null,
        execute: () => {
          if (explorerState.sortBy === opt.field) {
            explorerState.setSort(opt.field, explorerState.sortOrder === 'asc' ? 'desc' : 'asc')
          } else {
            explorerState.setSort(opt.field, 'asc')
          }
        },
      })),
    ],
  })

  toolbar.register({
    id: 'filter-button', plugin: 'explorer',
    type: 'custom', group: 'view', placement: 'right', priority: 10,
    component: markRaw(FilterButton),
    show: () => !explorerState.isAtHome,
  })

  toolbar.register({
    id: 'entry-count', plugin: 'explorer',
    type: 'custom', group: 'view', placement: 'right', priority: 5,
    component: markRaw(EntryCount),
    show: () => true,
  })

  toolbar.register({
    id: 'write-mode-chip', plugin: 'explorer',
    type: 'custom', group: 'view', placement: 'right', priority: 3,
    component: markRaw(WriteModeChip),
    show: () => true,
  })

  toolbar.register({
    id: 'settings-menu', plugin: 'explorer',
    type: 'custom', group: 'settings', placement: 'right', priority: 10,
    component: markRaw(SettingsMenu),
    show: () => true,
  })

  toolbar.register({
    id: 'mobile-menu', plugin: 'explorer',
    type: 'custom', group: 'settings', placement: 'right', priority: 20,
    component: markRaw(MobileMenu),
    show: () => true,
  })
}

export async function teardown(ctx) {
  const slotHost = ctx.services.get('slot.host')
  slotHost.remove('sidebar.top', 'explorer')
  slotHost.remove('content.layout', 'explorer')
  slotHost.remove('toolbar', 'explorer')
  ctx.services.get('toolbar.registry').unregisterAll('explorer')
  ctx.services.unregister('explorer.sidebar', 'explorer')
  ctx.services.unregister('explorer.ContextMenu', 'explorer')
  ctx.services.unregister('explorer.useExplorerKeyboard', 'explorer')
  ctx.services.unregister('explorer.useContextMenu', 'explorer')
  ctx.services.unregister('explorer.useRubberBand', 'explorer')
  ctx.services.unregister('explorer.state', 'explorer')
}
