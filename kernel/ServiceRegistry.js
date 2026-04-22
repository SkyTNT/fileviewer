export class ServiceNotFoundError extends Error {
  constructor(name) {
    super(`Service '${name}' not found — timed out waiting for registration`)
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
    this._pending  = new Map()  // name -> [{ resolve, timer }]
  }

  register(name, impl, pluginId) {
    if (this._services.has(name)) {
      const existing = this._services.get(name)
      throw new ServiceConflictError(name, existing.pluginId)
    }
    this._services.set(name, { impl, pluginId })
    const waiters = this._pending.get(name)
    if (waiters) {
      this._pending.delete(name)
      for (const { resolve, timer } of waiters) {
        clearTimeout(timer)
        resolve(impl)
      }
    }
  }

  // Returns a Promise that resolves when the service is registered.
  // Resolves immediately if already available. Rejects after timeout (default 10 s)
  // to surface circular dependencies or missing plugins as clear errors.
  getAsync(name, timeout = 10_000) {
    const entry = this._services.get(name)
    if (entry) return Promise.resolve(entry.impl)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this._pending.get(name)
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve)
          if (idx !== -1) waiters.splice(idx, 1)
          if (waiters.length === 0) this._pending.delete(name)
        }
        reject(new ServiceNotFoundError(name))
      }, timeout)
      if (!this._pending.has(name)) this._pending.set(name, [])
      this._pending.get(name).push({ resolve, timer })
    })
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
