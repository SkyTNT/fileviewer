import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { createI18n } from 'vue-i18n'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import App from './App.vue'
import { Kernel } from './kernel/index.js'

const SUPPORTED = ['en', 'zh-CN', 'zh-TW', 'ja']
function detectLocale() {
  const saved = localStorage.getItem('fv-locale')
  if (saved && SUPPORTED.includes(saved)) return saved
  for (const lang of navigator.languages ?? [navigator.language]) {
    const lower = lang.toLowerCase()
    if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-hant') return 'zh-TW'
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('ja')) return 'ja'
    if (lower.startsWith('en')) return 'en'
  }
  return 'en'
}

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: localStorage.getItem('fv-mode') || 'dark',
    themes: {
      light: { dark: false, colors: { primary: localStorage.getItem('fv-accent') || '#1867C0' } },
      dark:  { dark: true,  colors: { primary: localStorage.getItem('fv-accent') || '#1867C0' } },
    },
  },
})

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en: {}, 'zh-CN': {}, 'zh-TW': {}, ja: {} },
})

const vueApp = createApp(App)
vueApp.use(vuetify)
vueApp.use(i18n)

const kernel = await Kernel.init(vueApp)
window.__fv_kernel = kernel

// Wire i18n instance into the i18n service
kernel.services.get('i18n').setInstance(i18n.global)

// Provide kernel services for injection in components
vueApp.provide('kernel', kernel)
vueApp.provide('services', kernel.services)
vueApp.provide('events', kernel.events)
vueApp.provide('slot.host', kernel.services.get('slot.host'))

const pluginModules = import.meta.glob('./plugins/*/index.js', { eager: false })
await kernel.pluginManager.loadAll(pluginModules)

vueApp.mount('#app')
