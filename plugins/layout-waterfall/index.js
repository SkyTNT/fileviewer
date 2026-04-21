export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = ctx.services.get('layout.registry')
  const views = ctx.services.get('explorer.views')
  layoutRegistry.register({
    key: 'waterfall',
    label: 'toolbar.viewWaterfall',
    icon: 'mdi-view-module-outline',
    component: views.waterfall,
  })
  if (!layoutRegistry.activeId) layoutRegistry.setActive('waterfall')
}

export async function teardown(ctx) {
  ctx.services.get('layout.registry').unregister('waterfall')
}
