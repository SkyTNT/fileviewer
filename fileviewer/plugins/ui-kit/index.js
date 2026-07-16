import { markRaw } from 'vue'
import PaginationBar from './PaginationBar.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  ctx.services.register('ui.pagination-bar', markRaw(PaginationBar), 'ui-kit')
}

export async function teardown(ctx) {
  ctx.services.unregister('ui.pagination-bar', 'ui-kit')
}
