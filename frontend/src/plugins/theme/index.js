export { useAppTheme, ACCENT_COLORS } from './composable.js'

export default {
  install() {
    // useTheme() requires component context so full init happens in App.vue onMounted.
    // This plugin primarily serves as the canonical import location for theme utilities.
  },
}
