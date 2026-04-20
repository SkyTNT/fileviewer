import { markRaw } from 'vue'
import LayoutToggleGroup from './LayoutToggleGroup.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = ctx.services.get('layout.registry')
  const winMgr         = ctx.services.get('window.manager')
  const toolbar        = ctx.services.get('toolbar.registry')

  toolbar.register({
    id: 'layout-switcher', plugin: 'layout-switcher',
    type: 'custom', group: 'layout', placement: 'right', priority: 10,
    component: markRaw(LayoutToggleGroup),
    hideOnMobile: true,
    show: () => true,
  })

  ctx.events.on('keyboard:keydown', ({ key }) => {
    if (winMgr?.windows.some(w => !w.minimized)) return
    const layouts = layoutRegistry.layouts
    const idx = layouts.findIndex((_, i) => String(i + 1) === key)
    if (idx >= 0) layoutRegistry.setActive(layouts[idx].key)
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.get('toolbar.registry').unregister('layout-switcher')
}
