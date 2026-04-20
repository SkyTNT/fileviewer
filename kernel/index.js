import { reactive, markRaw } from 'vue'
import { ServiceRegistry } from './ServiceRegistry.js'
import { EventBus } from './EventBus.js'
import { PluginManager } from './PluginManager.js'

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export { ServiceRegistry, EventBus, PluginManager }

export class Kernel {
  constructor(vueApp, services, events, pluginManager) {
    this.app = vueApp
    this.services = services
    this.events = events
    this.pluginManager = pluginManager
  }

  static async init(vueApp) {
    const services = new ServiceRegistry()
    const events = new EventBus()

    // app.registry
    const appRegistry = reactive({
      _descriptors: [],
      register(descriptor) {
        this._descriptors.push(descriptor)
      },
      unregister(key) {
        const idx = this._descriptors.findIndex(d => d.key === key)
        if (idx >= 0) this._descriptors.splice(idx, 1)
      },
      open(target, opts = {}) {
        if (!target) return null
        const desc = opts.app
          ? this._descriptors.find(d => d.key === opts.app)
          : [...this._descriptors].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).find(d => d.match(target, opts))
        if (!desc) return null
        const winMgr = services.get('window.manager')
        const winId = `app:${desc.key}:${target.path ?? target}`
        winMgr.open({
          id:        winId,
          title:     target.name ?? String(target),
          icon:      desc.icon ?? 'mdi-file-outline',
          component: desc.component,
          props:     { file: target, appOpts: opts },
          width:     desc.defaultWidth  ?? 900,
          height:    desc.defaultHeight ?? 600,
          maximized: desc.overlay ?? false,
        })
        return winId
      },
      get descriptors() { return this._descriptors },
    })
    services.register('app.registry', appRegistry, 'kernel')

    // layout.registry
    const layoutRegistry = reactive({
      _layouts: [],
      _activeId: null,
      register(layout) { this._layouts.push(layout) },
      unregister(key) {
        const idx = this._layouts.findIndex(l => l.key === key)
        if (idx >= 0) this._layouts.splice(idx, 1)
      },
      setActive(key) { this._activeId = key },
      get activeId() { return this._activeId },
      get layouts() { return this._layouts },
      get active() { return this._layouts.find(l => l.key === this._activeId) },
    })
    services.register('layout.registry', layoutRegistry, 'kernel')

    // action.registry
    const actionRegistry = reactive({
      _actions: [],
      register(action) { this._actions.push(action) },
      unregisterAll(pluginId) {
        this._actions = this._actions.filter(a => a.plugin !== pluginId)
      },
      resolveMenu() {
        return this._actions
          .filter(a => a.showIn?.contextMenu?.() === true)
          .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
      },
      resolveDetail() {
        const sorted = this._actions
          .filter(a => a.showIn?.detailPanel?.() === true)
          .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
        const result = []
        const grouped = new Map()
        for (const a of sorted) {
          if (!a.pairGroup) { result.push(a); continue }
          if (!grouped.has(a.pairGroup)) {
            const pair = { type: 'pair', id: a.pairGroup, items: [] }
            grouped.set(a.pairGroup, pair)
            result.push(pair)
          }
          grouped.get(a.pairGroup).items.push(a)
        }
        return result
      },
    })
    services.register('action.registry', actionRegistry, 'kernel')

    // toolbar.registry
    const toolbarRegistry = reactive({
      _groups: [],
      _items: [],
      registerGroup(group) { this._groups.push(group) },
      register(item) { this._items.push(item) },
      unregisterAll(pluginId) {
        this._groups = this._groups.filter(g => g._pluginId !== pluginId)
        this._items  = this._items.filter(i => i._pluginId !== pluginId)
      },
      unregister(id) {
        this._items = this._items.filter(i => i.id !== id)
      },
      get groups() { return this._groups },
      get items() { return this._items },
      itemsForGroup(groupKey) {
        return this._items.filter(i => i.group === groupKey).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      },
    })
    services.register('toolbar.registry', toolbarRegistry, 'kernel')

    // i18n
    const i18nService = {
      _instance: null,
      setInstance(instance) { this._instance = instance },
      extend(pluginId, locale, messages) {
        if (!this._instance) return
        const existing = this._instance.getLocaleMessage(locale)
        this._instance.setLocaleMessage(locale, deepMerge(existing, messages))
      },
      t(...args) { return this._instance?.t(...args) ?? args[0] },
      get locale() { return this._instance?.locale },
    }
    services.register('i18n', i18nService, 'kernel')

    // file.types
    const fileTypeRegistry = {
      _icons:  {},
      _colors: {},
      register(type, icon, color) {
        if (icon  != null) this._icons[type]  = icon
        if (color != null) this._colors[type] = color
      },
      icon(type,  fallback = 'mdi-file-outline') { return this._icons[type]  ?? fallback },
      color(type, fallback = undefined)           { return this._colors[type] ?? fallback },
      formatBytes(bytes, fallback = '') {
        if (bytes == null) return fallback
        if (bytes < 1024)       return bytes + ' B'
        if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB'
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
        return (bytes / 1073741824).toFixed(1) + ' GB'
      },
      formatDate(ts, fallback = '') {
        if (!ts) return fallback
        return new Date(ts * 1000).toLocaleString()
      },
    }
    services.register('file.types', fileTypeRegistry, 'kernel')

    // slot.host
    const slotHost = reactive({
      _slots: new Map(),
      inject(slotName, component, pluginId, props = {}) {
        if (!this._slots.has(slotName)) this._slots.set(slotName, [])
        this._slots.get(slotName).push({
          component: markRaw(component),
          pluginId,
          props,
          key: `${pluginId}:${slotName}:${Date.now()}`,
        })
      },
      remove(slotName, pluginId) {
        if (!this._slots.has(slotName)) return
        this._slots.set(slotName, this._slots.get(slotName).filter(e => e.pluginId !== pluginId))
      },
      has(slotName) { return (this._slots.get(slotName)?.length ?? 0) > 0 },
      get(slotName) { return this._slots.get(slotName) ?? [] },
    })
    services.register('slot.host', slotHost, 'kernel')

    // app.config
    const appConfig = reactive({
      writeMode: false,
      roots: [],
      async load() {
        try {
          const res = await fetch('/api/config', { credentials: 'include' })
          if (!res.ok) return
          const data = await res.json()
          this.writeMode = data.write_mode ?? false
          this.roots = data.roots ?? []
        } catch { /* ignore */ }
      },
    })
    services.register('app.config', appConfig, 'kernel')
    services.register('event.bus', events, 'kernel')

    const pluginManager = new PluginManager(services, events)
    return new Kernel(vueApp, services, events, pluginManager)
  }
}
