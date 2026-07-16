<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const appConfig = inject('services').get('app.config')
const { t } = useI18n()
const { mobile } = useDisplay()
</script>

<template>
  <v-chip
    v-if="!mobile"
    size="x-small"
    :color="appConfig.writeMode ? 'warning' : 'default'"
    :variant="appConfig.writeMode ? 'tonal' : 'tonal'"
    class="mr-1"
    style="pointer-events:none"
  >
    <v-icon start size="12">{{ appConfig.writeMode ? 'mdi-pencil' : 'mdi-eye-outline' }}</v-icon>
    {{ appConfig.writeMode ? t('toolbar.writeMode') : t('toolbar.readMode') }}
  </v-chip>
</template>
