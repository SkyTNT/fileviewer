import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import DataFrameViewer from './DataFrameViewer.vue'
import { createDataframeApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = await ctx.services.getAsync('i18n')
  i18n.extend('dataframe', 'en', en)
  i18n.extend('dataframe', 'zh-CN', zhCN)
  i18n.extend('dataframe', 'zh-TW', zhTW)
  i18n.extend('dataframe', 'ja', ja)

  const [http, winMgr, registry, ft] = await Promise.all([
    ctx.services.getAsync('network.http'),
    ctx.services.getAsync('window.manager'),
    ctx.services.getAsync('app.registry'),
    ctx.services.getAsync('file.types'),
  ])
  ft.register('parquet', 'mdi-table-large',            'warning')
  ft.register('csv',     'mdi-file-delimited-outline', 'teal')
  ft.register('json',    'mdi-code-json',              'secondary')
  ft.register('jsonl',   'mdi-code-json',              'secondary')
  ctx.services.register('dataframe.api', createDataframeApi(http), 'dataframe')

  registry.register({
    key: 'dataframe',
    icon: 'mdi-table-large',
    priority: 20,
    match: (target) => !Array.isArray(target) && ['parquet', 'csv', 'jsonl'].includes(target?.type),
    open(target) {
      const id = `app:dataframe:${target.path}`
      winMgr.open({ id, title: target.name, icon: 'mdi-table-large', component: markRaw(DataFrameViewer), props: { file: target }, width: 1200, height: 680, maximized: false })
      return id
    },
  })
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('dataframe')
  ctx.services.unregister('dataframe.api', 'dataframe')
}
