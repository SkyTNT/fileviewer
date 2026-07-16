import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import MidiEditor from './MidiEditor.vue'
import { createMidiApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const [i18n, http, winMgr, registry, ft] = await Promise.all([
    ctx.services.getAsync('i18n'),
    ctx.services.getAsync('network.http'),
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('app.registry'),
    ctx.services.getAsync('file.types'),
  ])

  i18n.extend('midi', 'en',    en)
  i18n.extend('midi', 'zh-CN', zhCN)
  i18n.extend('midi', 'zh-TW', zhTW)
  i18n.extend('midi', 'ja',    ja)

  ft.register('midi', 'mdi-music-note', 'deep-purple')

  const midiApi = createMidiApi(http)
  ctx.services.register('midi.api', midiApi, 'midi')

  registry.register({
    key: 'midi-editor',
    icon: 'mdi-music-note',
    priority: 50,
    match: (target) => !Array.isArray(target) && target?.type === 'midi',
    open(target) {
      const id = `app:midi:${target.path}`
      winMgr.open({
        id,
        title: target.name,
        icon: 'mdi-music-note',
        component: markRaw(MidiEditor),
        props: { file: target },
        width: 1280,
        height: 760,
        maximized: false,
      })
      return id
    },
  })
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('midi-editor')
  ctx.services.unregister('midi.api', 'midi')
  ctx.services.get('file.types').unregister('midi')
}
