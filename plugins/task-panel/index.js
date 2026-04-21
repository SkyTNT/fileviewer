import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import TaskPanel from './TaskPanel.vue'
import { createTaskState } from './state.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('task-panel', 'en', en)
  i18n.extend('task-panel', 'zh-CN', zhCN)
  i18n.extend('task-panel', 'zh-TW', zhTW)
  i18n.extend('task-panel', 'ja', ja)

  const slotHost  = ctx.services.get('slot.host')
  const taskState = createTaskState()
  ctx.services.register('task.state', taskState, 'task-panel')
  slotHost.inject('task.panel', markRaw(TaskPanel), 'task-panel')
}

export async function teardown(ctx) {
  ctx.services.get('slot.host').remove('task.panel', 'task-panel')
  ctx.services.unregister('task.state', 'task-panel')
}
