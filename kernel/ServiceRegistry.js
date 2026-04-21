export class ServiceNotFoundError extends Error {
  constructor(name) {
    super(`Service '${name}' not found — check manifest requires.services`)
    this.name = 'ServiceNotFoundError'
  }
}

export class ServiceConflictError extends Error {
  constructor(name, owner) {
    super(`Service '${name}' already registered by '${owner}'`)
    this.name = 'ServiceConflictError'
  }
}

export class ServiceRegistry {
  constructor() {
    this._services = new Map()  // name -> { impl, pluginId }
  }

  register(name, impl, pluginId) {
    if (this._services.has(name)) {
      const existing = this._services.get(name)
      throw new ServiceConflictError(name, existing.pluginId)
    }
    this._services.set(name, { impl, pluginId })
  }

  unregister(name, pluginId) {
    const entry = this._services.get(name)
    if (entry && entry.pluginId === pluginId) {
      this._services.delete(name)
    }
  }

  get(name) {
    const entry = this._services.get(name)
    if (!entry) throw new ServiceNotFoundError(name)
    return entry.impl
  }

  unregisterPlugin(pluginId) {
    for (const [name, entry] of this._services) {
      if (entry.pluginId === pluginId) this._services.delete(name)
    }
  }
}
