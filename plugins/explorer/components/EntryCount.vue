<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const store = inject('services').get('explorer.state')
const { t } = useI18n()
const { mobile } = useDisplay()
</script>

<template>
  <span v-if="!mobile && !store.isAtHome" class="text-caption text-medium-emphasis mr-2" style="white-space:nowrap">
    {{ t('toolbar.items', { n: store.total }) }}
  </span>
</template>
