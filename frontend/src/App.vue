<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useFileStore } from './stores/fileStore.js'
import { useAuthStore } from './stores/authStore.js'
import { useViewerRegistry } from './composables/useViewerRegistry.js'
import { useAppTheme } from './composables/useAppTheme.js'
import DirectoryTree from './components/sidebar/DirectoryTree.vue'
import FileDetail from './components/sidebar/FileDetail.vue'
import ExplorerToolbar from './components/explorer/ExplorerToolbar.vue'
import WaterfallView from './components/explorer/WaterfallView.vue'
import ListView from './components/explorer/ListView.vue'
import RootsView from './components/explorer/RootsView.vue'
import LoginPage from './components/LoginPage.vue'
import AppNotifications from './components/AppNotifications.vue'
import UploadPanel from './components/UploadPanel.vue'

const store     = useFileStore()
const authStore = useAuthStore()
const { VIEWERS, refs, open } = useViewerRegistry()
const appTheme = useAppTheme()
const { mobile } = useDisplay()
const { t } = useI18n()

const sidebarWidth   = ref(260)
const sidebarVisible = ref(true)
const resizing       = ref(false)

const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 600

// ── Drag & drop upload ────────────────────────────────────────────────────────
const dragCounter     = ref(0)
const isDragging      = ref(false)
const canWriteHere    = computed(() => store.writeMode && !store.isAtHome)

function onDragEnter(e) {
  if (!e.dataTransfer?.types?.includes('Files')) return
  dragCounter.value++
  isDragging.value = true
}

function onDragLeave() {
  if (--dragCounter.value <= 0) {
    dragCounter.value = 0
    isDragging.value = false
  }
}

function onDrop(e) {
  dragCounter.value = 0
  isDragging.value = false
  if (!canWriteHere.value) return
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) store.addUploads(store.currentPath, files)
}

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

// Auto-close sidebar when navigating on mobile
watch(() => store.currentPath, () => {
  if (mobile.value) sidebarVisible.value = false
})

onMounted(async () => {
  const saved = localStorage.getItem('fv-sidebar-width')
  if (saved && !mobile.value) sidebarWidth.value = parseInt(saved)
  sidebarVisible.value = !mobile.value
  appTheme.init()

  // Listen for 401s emitted by axios interceptor
  window.addEventListener('fv:unauthorized', () => {
    authStore.loggedIn = false
  })

  await authStore.checkStatus()
  if (authStore.loggedIn) store.init()
})

// Once logged in (after login form submit), bootstrap the app
watch(() => authStore.loggedIn, (v) => {
  if (v) store.init()
})

</script>

<template>
  <v-app>
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

      <DirectoryTree />

      <!-- Drag handle -->
      <div
        class="sidebar-resizer"
        :class="{ active: resizing }"
        @mousedown="startResize"
      />
    </v-navigation-drawer>

    <v-app-bar density="compact" elevation="1">
      <ExplorerToolbar @toggle-sidebar="sidebarVisible = !sidebarVisible" />
      <v-progress-linear
        :active="store.loading"
        :indeterminate="store.loading"
        color="primary"
        absolute
        location="bottom"
      />
    </v-app-bar>

    <v-main>
      <div
        style="position:relative; height:100%"
        @dragenter="onDragEnter"
        @dragleave="onDragLeave"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <RootsView v-if="store.isAtHome" />
        <WaterfallView
          v-else-if="store.viewMode === 'waterfall'"
          @open-file="open"
        />
        <ListView
          v-else
          @open-file="open"
        />

        <Transition name="drop-fade">
          <div v-if="isDragging" class="drop-overlay" :class="{ 'drop-overlay--allowed': canWriteHere }">
            <div class="drop-overlay-inner">
              <v-icon size="56" :color="canWriteHere ? 'primary' : 'medium-emphasis'">
                {{ canWriteHere ? 'mdi-upload-outline' : 'mdi-upload-off-outline' }}
              </v-icon>
              <div class="text-h6 mt-3">
                {{ canWriteHere ? t('dropzone.drop') : t('dropzone.notAllowed') }}
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </v-main>

    <!-- Right detail drawer -->
    <v-navigation-drawer
      :model-value="store.selectedEntries.length > 0 && !store.isAtHome"
      location="end"
      :width="280"
      @update:model-value="v => { if (!v) store.selectEntry(null) }"
    >
      <FileDetail @open-file="open" />
    </v-navigation-drawer>

    <!-- Viewers — rendered generically from the registry. To add a new viewer,
         register its descriptor in useViewerRegistry.js. -->
    <component
      v-for="v in VIEWERS"
      :key="v.key"
      :is="v.component"
      :ref="(el) => refs[v.key].value = el"
      @open-file="open"
    />

    <AppNotifications />
    <UploadPanel />

    <!-- Login overlay — shown when auth is required and not logged in -->
    <LoginPage v-if="!authStore.checking && authStore.authRequired && !authStore.loggedIn" />
  </v-app>
</template>

<style>
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(4px);
  border: 3px dashed rgba(var(--v-theme-on-surface), 0.25);
  pointer-events: none;
}
.drop-overlay--allowed {
  border-color: rgba(var(--v-theme-primary), 0.6);
  background: rgba(var(--v-theme-primary), 0.06);
}
.drop-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.drop-fade-enter-active,
.drop-fade-leave-active {
  transition: opacity 0.15s ease;
}
.drop-fade-enter-from,
.drop-fade-leave-to {
  opacity: 0;
}

.tree-sidebar .v-navigation-drawer__content {
  overflow: hidden;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 100;
  transition: background 0.15s;
}
.sidebar-resizer:hover,
.sidebar-resizer.active {
  background: rgba(var(--v-theme-primary), 0.4);
}
</style>
