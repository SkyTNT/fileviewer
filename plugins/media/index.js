import { markRaw } from 'vue'
import MediaPlayer from './MediaPlayer.vue'
import { createMediaApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  ctx.services.register('media.api', createMediaApi(), 'media')
  const registry   = ctx.services.get('app.registry')

  registry.register({
    key: 'media',
    component: markRaw(MediaPlayer),
    icon: 'mdi-play-circle-outline',
    defaultWidth: 960,
    defaultHeight: 580,
    match: (target) => !Array.isArray(target) && ['video', 'audio'].includes(target?.type),
  })
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('media')
  ctx.services.unregister('media.api', 'media')
}
