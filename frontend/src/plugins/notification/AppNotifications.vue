<script setup>
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from './store.js'

const notif = useNotificationStore()
const { t } = useI18n()
</script>

<template>
  <!-- Error / success toast -->
  <v-snackbar v-model="notif.visible" :color="notif.color" timeout="3000" location="bottom">
    <v-icon class="mr-2">{{ notif.color === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
    {{ notif.msg }}
  </v-snackbar>
</template>
