import { manifest } from './manifest.js'
export { manifest }

import http, { httpStream } from './http.js'
import { readSSE } from './sse.js'

export async function setup(ctx) {
  ctx.services.register('network.http', http, 'network')
  ctx.services.register('network.httpStream', httpStream, 'network')
  ctx.services.register('network.sse', readSSE, 'network')
}

export async function teardown(ctx) {
  ctx.services.unregister('network.http', 'network')
  ctx.services.unregister('network.httpStream', 'network')
  ctx.services.unregister('network.sse', 'network')
}
