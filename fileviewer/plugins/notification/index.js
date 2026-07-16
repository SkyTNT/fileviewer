import { markRaw } from 'vue'
import AppNotifications from './AppNotifications.vue'
export { manifest } from './manifest.js'

export async function setup(ctx) {
  const slotHost = await ctx.services.getAsync('slot.host')
  slotHost.inject('notifications', markRaw(AppNotifications), 'notification')

  // Register notification service
  ctx.services.register('notification.show', {
    show: (msg, color = 'error') => ctx.events.emit('notification:show', { msg, color }),
    error: (msg) => ctx.events.emit('notification:show', { msg, color: 'error' }),
    success: (msg) => ctx.events.emit('notification:show', { msg, color: 'success' }),
  }, 'notification')
}

export async function teardown(ctx) {
  ctx.services.get('slot.host').remove('notifications', 'notification')
  ctx.services.unregister('notification.show', 'notification')
}
