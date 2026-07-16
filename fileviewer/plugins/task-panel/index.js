import { markRaw, watch } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import TaskPanel from './TaskPanel.vue'
import { createTaskState } from './state.js'
export { manifest } from './manifest.js'

const TASK_PANEL_WIN_ID = 'task-panel:main'
let savedState = null

export async function setup(ctx) {
  const i18n = await ctx.services.getAsync('i18n')
  i18n.extend('task-panel', 'en', en)
  i18n.extend('task-panel', 'zh-CN', zhCN)
  i18n.extend('task-panel', 'zh-TW', zhTW)
  i18n.extend('task-panel', 'ja', ja)

  const taskState = createTaskState()
  ctx.services.register('task.state', taskState, 'task-panel')

  const winMgr = await ctx.services.getAsync('window.manager')

  watch(() => taskState.tasks.length, (n, prev) => {
    if (n > prev && n > 0) {
      winMgr.open({
        id: TASK_PANEL_WIN_ID,
        title: 'Tasks',
        icon: 'mdi-progress-download',
        component: markRaw(TaskPanel),
        props: { onSaveState: s => { savedState = s } },
        width:  savedState?.w ?? 360,
        height: savedState?.h ?? 500,
        x: savedState?.x ?? window.innerWidth  - 360 - 16,
        y: savedState?.y ?? window.innerHeight - 500 - 16,
        noTitleBar: true,
        background: true,
      })
    } else if (n === 0) {
      winMgr.close(TASK_PANEL_WIN_ID)
    }
  })
}

export async function teardown(ctx) {
  ctx.services.get('window.manager').close(TASK_PANEL_WIN_ID)
  ctx.services.unregister('task.state', 'task-panel')
}
