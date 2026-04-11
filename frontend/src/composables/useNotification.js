import { ref } from 'vue'

// Module-level singleton — one shared snackbar state for the entire app
const notifMsg     = ref('')
const notifColor   = ref('error')
const notifVisible = ref(false)

export function useNotification() {
  function show(msg, color = 'error') {
    notifMsg.value     = msg
    notifColor.value   = color
    notifVisible.value = true
  }
  const showError   = (msg) => show(msg, 'error')
  const showSuccess = (msg) => show(msg, 'success')
  return { notifMsg, notifColor, notifVisible, showError, showSuccess }
}
