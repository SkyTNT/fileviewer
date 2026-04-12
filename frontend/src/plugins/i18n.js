import { createI18n } from 'vue-i18n'
import en from '../locales/en.js'
import zhCN from '../locales/zh-CN.js'
import zhTW from '../locales/zh-TW.js'
import ja from '../locales/ja.js'

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

const savedLocale = detectLocale()

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    ja,
  },
})

export default i18n
