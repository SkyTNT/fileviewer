import { markRaw } from 'vue'
import ListView from './ListView.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = ctx.services.get('layout.registry')
  layoutRegistry.register({
    key: 'list',
    label: 'toolbar.viewList',
    icon: 'mdi-view-list-outline',
    component: markRaw(ListView),
  })
}

export async function teardown(ctx) {
  ctx.services.get('layout.registry').unregister('list')
}
