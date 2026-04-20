import { markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import DataFrameViewer from './DataFrameViewer.vue'
import { createDataframeApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('dataframe', 'en', en)
  i18n.extend('dataframe', 'zh-CN', zhCN)
  i18n.extend('dataframe', 'zh-TW', zhTW)
  i18n.extend('dataframe', 'ja', ja)

  ctx.services.register('dataframe.api', createDataframeApi(ctx.services.get('network.http')), 'dataframe')

  ctx.services.get('app.registry').register({
    key: 'dataframe',
    component: markRaw(DataFrameViewer),
    icon: 'mdi-table-large',
    defaultWidth: 1200,
    defaultHeight: 680,
    priority: 20,
    match: (target) => !Array.isArray(target) && ['parquet', 'csv', 'jsonl'].includes(target?.type),
  })
}

export async function teardown(ctx) {
  ctx.services.get('app.registry').unregister('dataframe')
  ctx.services.unregister('dataframe.api', 'dataframe')
}
