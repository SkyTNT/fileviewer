import { markRaw } from 'vue'
import WaterfallView from './WaterfallView.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = ctx.services.get('layout.registry')
  layoutRegistry.register({
    key: 'waterfall',
    label: 'toolbar.viewWaterfall',
    icon: 'mdi-view-module-outline',
    component: markRaw(WaterfallView),
  })
  if (!layoutRegistry.activeId) layoutRegistry.setActive('waterfall')
}

export async function teardown(ctx) {
  ctx.services.get('layout.registry').unregister('waterfall')
}
