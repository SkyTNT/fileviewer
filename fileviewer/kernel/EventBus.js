export class EventBus {
  constructor() {
    this._handlers = new Map()  // event -> [{handler, pluginId}]
  }

  on(event, handler, pluginId) {
    if (!this._handlers.has(event)) this._handlers.set(event, [])
    this._handlers.get(event).push({ handler, pluginId })
  }

  off(event, handler) {
    const list = this._handlers.get(event)
    if (!list) return
    const idx = list.findIndex(h => h.handler === handler)
    if (idx >= 0) list.splice(idx, 1)
  }

  emit(event, payload) {
    const list = this._handlers.get(event)
    if (!list) return
    for (const { handler } of [...list]) {
      try { handler(payload) } catch (e) { console.error(`EventBus handler error [${event}]:`, e) }
    }
  }

  offPlugin(pluginId) {
    for (const [event, list] of this._handlers) {
      this._handlers.set(event, list.filter(h => h.pluginId !== pluginId))
    }
  }
}
