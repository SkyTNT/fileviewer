import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '../services/api.js'

export const useAuthStore = defineStore('auth', () => {
  const authRequired = ref(false)
  const loggedIn     = ref(true)
  const checking     = ref(true)

  async function checkStatus() {
    checking.value = true
    try {
      const res = await authApi.status()
      authRequired.value = res.data.auth_required
      loggedIn.value     = res.data.logged_in
    } finally {
      checking.value = false
    }
  }

  async function login(username, password) {
    await authApi.login(username, password)
    loggedIn.value = true
  }

  async function logout() {
    await authApi.logout()
    loggedIn.value = false
  }

  return { authRequired, loggedIn, checking, checkStatus, login, logout }
})
