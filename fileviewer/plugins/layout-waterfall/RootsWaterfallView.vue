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
  <div class="roots-grid pa-6">
    <v-card
      v-for="root in store.roots"
      :key="root.slug"
      class="root-card"
      variant="tonal"
      rounded="xl"
      hover
      @click="store.navigate(root.slug)"
    >
      <v-card-text class="pa-5">
        <div class="d-flex align-center ga-3 mb-4">
          <v-icon size="40" color="primary">mdi-harddisk</v-icon>
          <div style="min-width:0">
            <div class="text-subtitle-1 font-weight-bold text-truncate">{{ root.name }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ root.disk ? fmt(root.disk.free) + ' ' + t('roots.free') : t('roots.na') }}
            </div>
          </div>
        </div>

        <template v-if="root.disk">
          <v-progress-linear
            :model-value="usedPct(root.disk)"
            :color="barColor(usedPct(root.disk))"
            bg-color="surface-variant"
            rounded
            height="6"
            class="mb-2"
          />
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>{{ fmt(root.disk.used) }} {{ t('roots.used') }}</span>
            <span>{{ fmt(root.disk.total) }} {{ t('roots.total') }}</span>
          </div>
        </template>
        <div v-else class="text-caption text-disabled">{{ t('roots.unavailable') }}</div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.roots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  align-content: start;
  overflow-y: auto;
  height: 100%;
}
.root-card {
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.root-card:hover {
  transform: translateY(-3px);
}
</style>
