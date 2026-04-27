import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import MediaPlayer from './MediaPlayer.vue'
import { createMediaApi } from './api.js'
export { manifest } from './manifest.js'

function formatDuration(secs) {
  if (secs == null) return null
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export async function setup(ctx) {
  const [i18n, ft] = await Promise.all([
    ctx.services.getAsync('i18n'),
    ctx.services.getAsync('file.types'),
  ])
  i18n.extend('media', 'en', en)
  i18n.extend('media', 'zh-CN', zhCN)
  i18n.extend('media', 'zh-TW', zhTW)
  i18n.extend('media', 'ja', ja)

  ft.registerDetailFields('video', (entry) => [
    entry.duration != null && { key: 'duration', label: 'media.duration', value: formatDuration(entry.duration) },
  ].filter(Boolean), 'media')

  ft.registerDetailFields('audio', (entry) => [
    entry.title    && { key: 'title',    label: 'media.title',    value: entry.title    },
    entry.artist   && { key: 'artist',   label: 'media.artist',   value: entry.artist   },
    entry.album    && { key: 'album',    label: 'media.album',    value: entry.album    },
    entry.duration != null && { key: 'duration', label: 'media.duration', value: formatDuration(entry.duration) },
  ].filter(Boolean), 'media')

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
  ctx.services.get('file.types').unregisterDetailFields('media')
}
