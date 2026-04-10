<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore.js'

const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const loading  = ref(false)
const error    = ref('')

async function doLogin() {
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) return
  loading.value = true
  error.value   = ''
  try {
    await authStore.login(u, p)
  } catch (e) {
    error.value = e.response?.data?.detail || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-overlay :model-value="true" persistent class="d-flex align-center justify-center" style="z-index:9999">
    <v-card width="360" class="pa-2">
      <v-card-title class="d-flex align-center justify-center pa-4 pb-2" style="gap:8px">
        <v-icon size="28">mdi-folder-lock-outline</v-icon>
        File Viewer
      </v-card-title>

      <v-card-text>
        <v-form @submit.prevent="doLogin">
          <v-text-field
            v-model="username"
            label="Username"
            prepend-inner-icon="mdi-account-outline"
            variant="outlined"
            density="comfortable"
            autofocus
            class="mb-2"
            @keydown.enter="doLogin"
          />
          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            prepend-inner-icon="mdi-lock-outline"
            variant="outlined"
            density="comfortable"
            class="mb-2"
            @keydown.enter="doLogin"
          />
          <v-alert v-if="error" type="error" density="compact" class="mb-3">{{ error }}</v-alert>
          <v-btn
            type="submit"
            color="primary"
            variant="flat"
            block
            size="large"
            :loading="loading"
            :disabled="!username.trim() || !password"
          >Login</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-overlay>
</template>
