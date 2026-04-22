import { markRaw } from 'vue'
import LayoutToggleGroup from './LayoutToggleGroup.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const [layoutRegistry, winMgr, toolbar] = await Promise.all([
    ctx.services.getAsync('layout.registry'),
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('toolbar.registry'),
  ])

  toolbar.register({
    id: 'layout-switcher', plugin: 'layout-switcher',
    type: 'custom', group: 'layout', placement: 'right', priority: 10,
    component: markRaw(LayoutToggleGroup),
    hideOnMobile: true,
    show: () => true,
  })

  ctx.events.on('keyboard:keydown', ({ key }) => {
    if (winMgr?.hasVisibleWindow) return
    const layouts = layoutRegistry.layouts
    const idx = layouts.findIndex((_, i) => String(i + 1) === key)
    if (idx >= 0) layoutRegistry.setActive(layouts[idx].key)
  }, ctx.pluginId)
}

export async function teardown(ctx) {
  ctx.services.get('toolbar.registry').unregister('layout-switcher')
}
