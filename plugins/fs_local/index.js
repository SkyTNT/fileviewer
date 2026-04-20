import { createFilesApi } from './api.js'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const http = ctx.services.get('network.http')
  const filesApi = createFilesApi(http)
  ctx.services.register('files.api', filesApi, 'fs_local')
}

export async function teardown(ctx) {
  ctx.services.unregister('files.api', 'fs_local')
}
