<script setup>
import { ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const services = inject('services')
const { t } = useI18n()

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
    const authState = services.get('auth.state')
    await authState.login(u, p)
  } catch (e) {
    error.value = e.response?.data?.detail || t('login.loginFailed')
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
        {{ t('login.title') }}
      </v-card-title>

      <v-card-text>
        <v-form @submit.prevent="doLogin">
          <v-text-field
            v-model="username"
            :label="t('login.username')"
            prepend-inner-icon="mdi-account-outline"
            variant="outlined"
            density="comfortable"
            autofocus
            class="mb-2"
            @keydown.enter="doLogin"
          />
          <v-text-field
            v-model="password"
            :label="t('login.password')"
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
          >{{ t('login.login') }}</v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-overlay>
</template>
