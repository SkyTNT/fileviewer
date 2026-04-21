export { manifest } from './manifest.js'

export async function setup(ctx) {
  const layoutRegistry = ctx.services.get('layout.registry')
  const views = ctx.services.get('explorer.views')
  layoutRegistry.register({
    key: 'list',
    label: 'toolbar.viewList',
    icon: 'mdi-view-list-outline',
    component: views.list,
  })
}

export async function teardown(ctx) {
  ctx.services.get('layout.registry').unregister('list')
}
