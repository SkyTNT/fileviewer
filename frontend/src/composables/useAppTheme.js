import { ref, computed } from 'vue'
import { useTheme } from 'vuetify'

export const ACCENT_COLORS = [
  { label: 'Blue',         value: '#1867C0' },
  { label: 'Indigo',       value: '#3F51B5' },
  { label: 'Deep Purple',  value: '#673AB7' },
  { label: 'Pink',         value: '#E91E63' },
  { label: 'Teal',         value: '#009688' },
  { label: 'Green',        value: '#4CAF50' },
  { label: 'Orange',       value: '#FF9800' },
]

export function useAppTheme() {
  const vuetifyTheme = useTheme()

  const isDark      = computed(() => vuetifyTheme.global.current.value.dark)
  const accentColor = ref(localStorage.getItem('fv-accent') || ACCENT_COLORS[0].value)

  function _applyColor(color) {
    vuetifyTheme.themes.value.light.colors.primary = color
    vuetifyTheme.themes.value.dark.colors.primary  = color
    accentColor.value = color
    localStorage.setItem('fv-accent', color)
  }

  function toggleMode() {
    const next = isDark.value ? 'light' : 'dark'
    vuetifyTheme.change(next)
    localStorage.setItem('fv-mode', next)
  }

  function setAccent(color) {
    _applyColor(color)
  }

  function init() {
    const mode  = localStorage.getItem('fv-mode')  || 'dark'
    const color = localStorage.getItem('fv-accent') || ACCENT_COLORS[0].value
    vuetifyTheme.change(mode)
    _applyColor(color)
  }

  return { isDark, accentColor, ACCENT_COLORS, toggleMode, setAccent, init }
}
