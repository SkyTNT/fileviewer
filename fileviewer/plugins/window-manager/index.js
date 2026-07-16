import { markRaw } from 'vue'
import { createWindowManager } from './windowManagerService.js'
import WindowManager from './WindowManager.vue'
import Taskbar from './Taskbar.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const manager = createWindowManager()
  ctx.services.register('window.manager', manager, 'window-manager')

  const slotHost = await ctx.services.getAsync('slot.host')
  slotHost.inject('windows', markRaw(WindowManager), 'window-manager', { manager })
  slotHost.inject('taskbar', markRaw(Taskbar), 'window-manager', { manager })
}

export async function teardown(ctx) {
  const slotHost = ctx.services.get('slot.host')
  slotHost.remove('windows', 'window-manager')
  slotHost.remove('taskbar', 'window-manager')
  ctx.services.unregister('window.manager', 'window-manager')
}
