<script setup>
import { ref, onMounted, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useFileStore } from './stores/fileStore.js'
import { useAuthStore } from './stores/authStore.js'
import { useFileOpener } from './composables/useFileOpener.js'
import { useAppTheme } from './composables/useAppTheme.js'
import DirectoryTree from './components/sidebar/DirectoryTree.vue'
import FileDetail from './components/sidebar/FileDetail.vue'
import ExplorerToolbar from './components/explorer/ExplorerToolbar.vue'
import WaterfallView from './components/explorer/WaterfallView.vue'
import ListView from './components/explorer/ListView.vue'
import ImageViewer from './components/viewers/ImageViewer.vue'
import DataFrameViewer from './components/viewers/DataFrameViewer.vue'
import JsonViewer from './components/viewers/JsonViewer.vue'
import TextViewer from './components/viewers/TextViewer.vue'
import MediaPlayer from './components/viewers/MediaPlayer.vue'
import HexViewer from './components/viewers/HexViewer.vue'
import LoginPage from './components/LoginPage.vue'

const store     = useFileStore()
const authStore = useAuthStore()
const { activeViewer, activeFile, openFile, closeViewer } = useFileOpener()
const appTheme = useAppTheme()
const { mobile } = useDisplay()

const imageViewerRef = ref(null)
const dfViewerRef = ref(null)
const jsonViewerRef = ref(null)
const textViewerRef = ref(null)
const mediaPlayerRef = ref(null)
const hexViewerRef   = ref(null)

const sidebarWidth   = ref(260)
const sidebarVisible = ref(true)
const snackbar       = ref(false)
const snackbarText   = ref('')
const resizing       = ref(false)

const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 600

function showError(msg) {
  snackbarText.value = msg
  snackbar.value = true
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

function handleOpenFile(file) {
  openFile(file)
  const ext = (file.extension || '').toLowerCase()
  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg'])
  const PARQUET_EXT = new Set(['.parquet'])
  const JSON_EXT = new Set(['.json', '.jsonl'])
  const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.ts'])
  const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus', '.wma'])
  if (IMAGE_EXT.has(ext)) {
    imageViewerRef.value?.open(file)
  } else if (PARQUET_EXT.has(ext)) {
    dfViewerRef.value?.open(file)
  } else if (JSON_EXT.has(ext)) {
    jsonViewerRef.value?.open(file)
  } else if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) {
    mediaPlayerRef.value?.open(file)
  } else {
    textViewerRef.value?.open(file)
  }
}
</script>

<template>
  <v-app>
    <v-navigation-drawer
      v-model="sidebarVisible"
      :width="sidebarWidth"
      :permanent="!mobile"
    >
      <v-list-item
        prepend-icon="mdi-folder-multiple-outline"
        title="File Viewer"
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
      <DirectoryTree />

      <!-- Drag handle -->
      <div
        class="sidebar-resizer"
        :class="{ active: resizing }"
        @mousedown="startResize"
      />
    </v-navigation-drawer>

    <v-app-bar density="compact" elevation="1">
      <ExplorerToolbar @toggle-sidebar="sidebarVisible = !sidebarVisible" @error="showError" />
    </v-app-bar>

    <v-main>
      <WaterfallView
        v-if="store.viewMode === 'waterfall'"
        @open-file="handleOpenFile"
        @error="showError"
      />
      <ListView
        v-else
        @open-file="handleOpenFile"
        @error="showError"
      />
    </v-main>

    <!-- Right detail drawer -->
    <v-navigation-drawer
      :model-value="!!store.selectedEntry"
      location="end"
      :width="280"
      @update:model-value="v => { if (!v) store.selectEntry(null) }"
    >
      <FileDetail @open-file="handleOpenFile" />
    </v-navigation-drawer>

    <!-- Viewers (portals / dialogs) -->
    <ImageViewer ref="imageViewerRef" />
    <DataFrameViewer ref="dfViewerRef" />
    <JsonViewer ref="jsonViewerRef" @open-dataframe="dfViewerRef?.open($event, 'jsonl')" />
    <TextViewer ref="textViewerRef" :file="activeFile" @error="showError" @open-hex="hexViewerRef?.open($event)" />
    <MediaPlayer ref="mediaPlayerRef" />
    <HexViewer ref="hexViewerRef" />

    <v-snackbar v-model="snackbar" color="error" timeout="4000" location="bottom">
      <v-icon class="mr-2">mdi-alert-circle-outline</v-icon>
      {{ snackbarText }}
    </v-snackbar>

    <!-- Login overlay — shown when auth is required and not logged in -->
    <LoginPage v-if="!authStore.checking && authStore.authRequired && !authStore.loggedIn" />
  </v-app>
</template>

<style>
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
