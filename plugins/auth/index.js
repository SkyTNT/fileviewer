import { reactive, markRaw } from 'vue'
import en   from './locales/en.js'
import zhCN from './locales/zh-CN.js'
import zhTW from './locales/zh-TW.js'
import ja   from './locales/ja.js'
import LoginPage from './LoginPage.vue'
import { createAuthApi } from './api.js'
export { manifest } from './manifest.js'

// Shared reactive state — components import useAuthStore() to access it
let _authState = null

export function useAuthStore() {
  return _authState
}

export async function setup(ctx) {
  const i18n = ctx.services.get('i18n')
  i18n.extend('auth', 'en', en)
  i18n.extend('auth', 'zh-CN', zhCN)
  i18n.extend('auth', 'zh-TW', zhTW)
  i18n.extend('auth', 'ja', ja)

  const http = ctx.services.get('network.http')
  const authApi = createAuthApi(http)
  const slotHost = ctx.services.get('slot.host')

  _authState = reactive({
    authRequired: false,
    loggedIn: true,
    checking: true,
    async checkStatus() {
      this.checking = true
      try {
        const res = await authApi.status()
        this.authRequired = res.data.auth_required
        this.loggedIn     = res.data.logged_in
      } finally {
        this.checking = false
      }
    },
    async login(username, password) {
      await authApi.login(username, password)
      this.loggedIn = true
      slotHost.remove('app.login', 'auth')
    },
    async logout() {
      await authApi.logout()
      this.loggedIn = false
      slotHost.inject('app.login', markRaw(LoginPage), 'auth')
    },
  })

  ctx.services.register('auth.state', _authState, 'auth')

  await _authState.checkStatus()
  if (_authState.authRequired && !_authState.loggedIn) {
    slotHost.inject('app.login', markRaw(LoginPage), 'auth')
  }

  window.addEventListener('fv:unauthorized', () => {
    _authState.loggedIn = false
    if (!slotHost.has('app.login')) {
      slotHost.inject('app.login', markRaw(LoginPage), 'auth')
    }
  })
}

export async function teardown(ctx) {
  ctx.services.get('slot.host').remove('app.login', 'auth')
  ctx.services.unregister('auth.state', 'auth')
  _authState = null
}
