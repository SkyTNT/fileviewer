import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notification', () => {
  const msg     = ref('')
  const color   = ref('error')
  const visible = ref(false)

  function show(message, c = 'error') {
    msg.value     = message
    color.value   = c
    visible.value = true
  }

  const showError   = (message) => show(message, 'error')
  const showSuccess = (message) => show(message, 'success')

  return { msg, color, visible, showError, showSuccess }
})
