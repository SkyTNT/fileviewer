<script setup>
import { computed, inject } from 'vue'

const store = inject('services').get('explorer.state')

const displayCrumbs = computed(() => {
  const crumbs = store.breadcrumbs
  if (crumbs.length <= 2) return crumbs
  const root   = crumbs[0]
  const last   = crumbs[crumbs.length - 1]
  const middle = crumbs.slice(1, -1)
  const totalLen = crumbs.slice(1).reduce((s, c) => s + c.name.length, 0)
  if (totalLen <= 30 && middle.length <= 3) return crumbs
  const abbr = middle.map(c => ({ ...c, displayName: c.name.charAt(0) }))
  if (abbr.length <= 3) return [root, ...abbr, last]
  return [root, { name: '...', path: null }, ...abbr.slice(-2), last]
})
</script>

<template>
  <div style="flex-shrink:1; min-width:0; overflow-x:auto; overflow-y:hidden">
    <v-breadcrumbs :items="displayCrumbs" density="compact" class="pa-0" style="flex-wrap:nowrap">
      <template #prepend>
        <v-icon size="16" class="mr-1" color="medium-emphasis">mdi-folder-outline</v-icon>
      </template>
      <template #item="{ item }">
        <v-breadcrumbs-item
          class="text-body-2"
          :style="item.path != null ? { cursor:'pointer', whiteSpace:'nowrap' } : { cursor:'default', opacity:0.5, whiteSpace:'nowrap' }"
          @click="item.path != null && store.navigate(item.path)"
        >
          {{ item.displayName ?? item.name }}
          <v-tooltip v-if="item.displayName" activator="parent" location="bottom">{{ item.name }}</v-tooltip>
        </v-breadcrumbs-item>
      </template>
      <template #divider>
        <v-icon size="14" color="medium-emphasis">mdi-chevron-right</v-icon>
      </template>
    </v-breadcrumbs>
  </div>
</template>
