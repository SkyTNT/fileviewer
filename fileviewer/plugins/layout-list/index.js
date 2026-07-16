import { markRaw } from 'vue'
import ListView      from './ListView.vue'
import RootsListView from './RootsListView.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = await ctx.services.getAsync('layout.registry')
  layoutRegistry.register({
    key: 'list',
    label: 'toolbar.viewList',
    icon: 'mdi-view-list-outline',
    component: markRaw(ListView),
    rootsComponent: markRaw(RootsListView),
  })
}

export async function teardown(ctx) {
  ctx.services.get('layout.registry').unregister('list')
}
