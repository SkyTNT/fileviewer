export class PluginContext {
  constructor(pluginId, services, events) {
    this.pluginId = pluginId
    this.services = services
    this.events = events
  }
}
