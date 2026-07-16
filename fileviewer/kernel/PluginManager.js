export class PluginManager {
  constructor(services, events) {
    this._services = services
    this._events = events
    this._plugins = new Map()
  }

  async loadAll(pluginModules) {
    // Import all plugin modules in parallel
    const loaded = (await Promise.all(
      Object.entries(pluginModules).map(async ([path, loader]) => {
        const mod = await loader()
        if (!mod.manifest) return null
        return { path, mod, manifest: mod.manifest }
      })
    )).filter(Boolean)

    // Run all setup() functions concurrently.
    // Each plugin calls ctx.services.getAsync() for its dependencies, which
    // waits until the providing plugin registers the service — no explicit
    // ordering or manifest requires declarations needed.
    const { PluginContext } = await import('./PluginContext.js')
    await Promise.all(
      loaded.map(async ({ mod, manifest }) => {
        const ctx = new PluginContext(manifest.id, this._services, this._events)
        if (mod.setup) await mod.setup(ctx)
        this._plugins.set(manifest.id, { mod, manifest })
      })
    )
  }

  get(pluginId) { return this._plugins.get(pluginId) }
  listAll() { return [...this._plugins.values()].map(p => p.manifest) }
}
