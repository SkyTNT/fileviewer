<template>
  <v-navigation-drawer
    v-model="sidebarVisible"
    :width="sidebarWidth"
    :permanent="!mobile"
    class="tree-sidebar"
  >
    <template #prepend>
      <v-list-item
        prepend-icon="mdi-folder-multiple-outline"
        :title="t('app.title')"
        nav
        style="min-height: 48px"
      >
        <template v-if="mobile" #append>
          <v-btn icon size="small" variant="text" @click="sidebarVisible = false">
            <v-icon size="20">mdi-close</v-icon>
          </v-btn>
        </template>
      </v-list-item>
      <v-divider />
    </template>

    <div style="flex:1; min-height:80px; overflow:hidden">
      <DirectoryTree />
    </div>

    <component
      :is="entry.component"
      v-for="entry in sidebarBottomEntries"
      :key="entry.key"
      v-bind="entry.props"
    />

    <div
      class="sidebar-resizer"
      :class="{ active: resizing }"
      @mousedown="startResize"
    />
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import DirectoryTree from './components/DirectoryTree.vue'

const events   = inject('events')
const services = inject('services')
const sidebarRegistry      = services.get('explorer.sidebar')
const sidebarBottomEntries = computed(() => sidebarRegistry?.sections ?? [])
const { mobile } = useDisplay()
const { t } = useI18n()

const sidebarWidth   = ref(260)
const sidebarVisible = ref(true)
const resizing       = ref(false)
const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 600

const store = inject('services').get('explorer.state')
watch(() => store.currentPath, () => { if (mobile.value) sidebarVisible.value = false })

onMounted(() => {
  const saved = localStorage.getItem('fv-sidebar-width')
  if (saved && !mobile.value) sidebarWidth.value = parseInt(saved)
  sidebarVisible.value = !mobile.value
})

function startResize(e) {
  e.preventDefault()
  resizing.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  const startX = e.clientX
  const startW = sidebarWidth.value
  function onMove(e) {
    sidebarWidth.value = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startW + e.clientX - startX))
  }
  function onUp() {
    resizing.value = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    localStorage.setItem('fv-sidebar-width', sidebarWidth.value)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// Listen for toggle-sidebar event from toolbar
events?.on('explorer:toggle-sidebar', () => { sidebarVisible.value = !sidebarVisible.value }, 'explorer')
</script>

<style>
.tree-sidebar .v-navigation-drawer__content { overflow: hidden; display: flex; flex-direction: column; }
.sidebar-resizer {
  position: absolute;
  top: 0; right: 0;
  width: 4px; height: 100%;
  cursor: col-resize;
  transition: background 0.15s;
}
.sidebar-resizer:hover, .sidebar-resizer.active {
  background: rgba(var(--v-theme-primary), 0.4);
}
</style>
