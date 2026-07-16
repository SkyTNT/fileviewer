<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

const services = inject('services')
const store    = services.get('explorer.state')
const { t }   = useI18n()

function fmt(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1)  + ' GB'
  return (bytes / 1e6).toFixed(1) + ' MB'
}

function usedPct(disk) {
  return disk?.total ? Math.round((disk.used / disk.total) * 100) : 0
}

function barColor(pct) {
  return pct > 90 ? 'error' : pct > 70 ? 'warning' : 'primary'
}
</script>

<template>
  <div class="list-scroll pa-2">
    <v-list lines="one">
      <v-list-item
        v-for="root in store.roots"
        :key="root.slug"
        rounded="lg"
        density="comfortable"
        color="primary"
        @click="store.navigate(root.slug)"
      >
        <template #prepend>
          <v-avatar size="36" color="primary" variant="tonal" rounded="lg">
            <v-icon size="20">mdi-harddisk</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="text-body-2 font-weight-medium">{{ root.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          {{ root.disk ? t('roots.freeOf', { free: fmt(root.disk.free), total: fmt(root.disk.total) }) : t('roots.unavailable') }}
        </v-list-item-subtitle>

        <template #append>
          <div v-if="root.disk" style="width:80px">
            <v-progress-linear
              :model-value="usedPct(root.disk)"
              :color="barColor(usedPct(root.disk))"
              bg-color="surface-variant"
              rounded
              height="4"
            />
          </div>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<style scoped>
.list-scroll {
  height: 100%;
  overflow-y: auto;
}
</style>
