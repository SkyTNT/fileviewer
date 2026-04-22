import { markRaw } from 'vue'
import MediaPlayer from './MediaPlayer.vue'
import { createMediaApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  ctx.services.register('media.api', createMediaApi(), 'media')
  const [winMgr, registry] = await Promise.all([
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('app.registry'),
  ])

  registry.register({
    key: 'media',
    icon: 'mdi-play-circle-outline',
    match: (target) => !Array.isArray(target) && ['video', 'audio'].includes(target?.type),
    open(target) {
      const id = `app:media:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-play-circle-outline', component: markRaw(MediaPlayer), props: { file: target }, width: 960, height: 580, maximized: false })
      return id
    },
  })
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('media')
  ctx.services.unregister('media.api', 'media')
}
