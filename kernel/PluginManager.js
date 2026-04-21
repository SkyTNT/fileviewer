export class CircularDependencyError extends Error {}

export class PluginManager {
  constructor(services, events) {
    this._services = services
    this._events = events
    this._plugins = new Map()
  }

  async loadAll(pluginModules) {
    // pluginModules: { './plugins/foo/index.js': () => import(...) }
    const loaded = []
    for (const [path, loader] of Object.entries(pluginModules)) {
      const mod = await loader()
      if (mod.manifest) loaded.push({ path, mod, manifest: mod.manifest })
    }

    const ordered = this._topoSort(loaded)

    for (const { mod, manifest } of ordered) {
      const { PluginContext } = await import('./PluginContext.js')
      const ctx = new PluginContext(manifest.id, this._services, this._events)
      if (mod.setup) await mod.setup(ctx)
      this._plugins.set(manifest.id, { mod, manifest })
    }
  }

  _topoSort(items) {
    // Build service -> pluginId map
    const svcToPlugin = new Map()
    for (const { manifest } of items) {
      for (const svc of (manifest.provides?.services ?? [])) {
        svcToPlugin.set(svc, manifest.id)
      }
    }

    const idToItem = new Map(items.map(i => [i.manifest.id, i]))
    const deps = new Map(items.map(i => [i.manifest.id, new Set()]))

    for (const { manifest } of items) {
      for (const svc of (manifest.requires?.services ?? [])) {
        const provider = svcToPlugin.get(svc)
        if (provider && provider !== manifest.id) deps.get(manifest.id).add(provider)
      }
      for (const pid of (manifest.requires?.plugins ?? [])) {
        if (idToItem.has(pid)) deps.get(manifest.id).add(pid)
      }
    }

    // Kahn's algorithm
    const inDegree = new Map(items.map(i => [i.manifest.id, 0]))
    for (const [id] of inDegree) inDegree.set(id, deps.get(id).size)

    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
    const result = []

    while (queue.length) {
      const node = queue.shift()
      result.push(idToItem.get(node))
      for (const [otherId, depSet] of deps) {
        if (depSet.has(node)) {
          depSet.delete(node)
          inDegree.set(otherId, inDegree.get(otherId) - 1)
          if (inDegree.get(otherId) === 0) queue.push(otherId)
        }
      }
    }

    if (result.length !== items.length) {
      const remaining = items.filter(i => !result.find(r => r.manifest.id === i.manifest.id))
      throw new CircularDependencyError(`Circular dependency: ${remaining.map(i => i.manifest.id).join(', ')}`)
    }

    return result
  }

  get(pluginId) { return this._plugins.get(pluginId) }
  listAll() { return [...this._plugins.values()].map(p => p.manifest) }
}
