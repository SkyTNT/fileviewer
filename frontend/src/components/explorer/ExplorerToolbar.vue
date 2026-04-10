<script setup>
import { useFileStore } from '../../stores/fileStore.js'
import { useAppTheme, ACCENT_COLORS } from '../../composables/useAppTheme.js'

defineEmits(['toggle-sidebar'])
const store = useFileStore()
const { isDark, accentColor, toggleMode, setAccent } = useAppTheme()
</script>

<template>
  <!-- Sidebar toggle -->
  <v-app-bar-nav-icon @click="$emit('toggle-sidebar')" />

  <!-- Breadcrumbs -->
  <v-breadcrumbs :items="store.breadcrumbs" density="compact" class="pa-0">
    <template #prepend>
      <v-icon size="16" class="mr-1" color="medium-emphasis">mdi-folder-outline</v-icon>
    </template>
    <template #item="{ item }">
      <v-breadcrumbs-item class="text-body-2" style="cursor:pointer" @click="store.navigate(item.path)">
        {{ item.name }}
      </v-breadcrumbs-item>
    </template>
    <template #divider>
      <v-icon size="14" color="medium-emphasis">mdi-chevron-right</v-icon>
    </template>
  </v-breadcrumbs>

  <v-spacer />

  <!-- Entry count -->
  <span class="text-caption text-medium-emphasis mr-3">
    {{ store.total }} items
  </span>

  <!-- View toggle -->
  <v-btn-toggle v-model="store.viewMode" mandatory density="compact" rounded="lg" class="mr-2" color="primary">
    <v-btn value="waterfall" size="small">
      <v-icon size="18">mdi-view-dashboard-outline</v-icon>
      <v-tooltip activator="parent">Waterfall</v-tooltip>
    </v-btn>
    <v-btn value="list" size="small">
      <v-icon size="18">mdi-view-list-outline</v-icon>
      <v-tooltip activator="parent">List</v-tooltip>
    </v-btn>
  </v-btn-toggle>

  <!-- Dark / Light toggle -->
  <v-btn icon size="small" class="mr-1" @click="toggleMode">
    <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    <v-tooltip activator="parent">{{ isDark ? 'Light mode' : 'Dark mode' }}</v-tooltip>
  </v-btn>

  <!-- Accent color picker -->
  <v-menu :close-on-content-click="false" location="bottom end">
    <template #activator="{ props }">
      <v-btn icon size="small" v-bind="props">
        <v-icon size="20" :color="accentColor">mdi-palette-outline</v-icon>
        <v-tooltip activator="parent">Accent color</v-tooltip>
      </v-btn>
    </template>
    <v-card min-width="180" class="pa-3">
      <div class="text-caption text-medium-emphasis mb-2">Accent color</div>
      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-for="c in ACCENT_COLORS"
          :key="c.value"
          icon
          size="28"
          :style="{ backgroundColor: c.value }"
          :elevation="accentColor === c.value ? 4 : 0"
          @click="setAccent(c.value)"
        >
          <v-icon v-if="accentColor === c.value" size="16" color="white">mdi-check</v-icon>
          <v-tooltip activator="parent">{{ c.label }}</v-tooltip>
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>
