<script setup>
import { ref, computed } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { useAuthStore } from '../../stores/authStore.js'
import { useAppTheme, ACCENT_COLORS } from '../../composables/useAppTheme.js'
import { writeApi } from '../../services/api.js'

defineEmits(['toggle-sidebar'])
const store     = useFileStore()
const authStore = useAuthStore()
const { isDark, accentColor, toggleMode, setAccent } = useAppTheme()

// Abbreviated breadcrumbs for long paths
const displayCrumbs = computed(() => {
  const crumbs = store.breadcrumbs
  if (crumbs.length <= 2) return crumbs

  const root   = crumbs[0]
  const last   = crumbs[crumbs.length - 1]
  const middle = crumbs.slice(1, -1)

  const totalLen = crumbs.slice(1).reduce((s, c) => s + c.name.length, 0)

  // Short enough — show full
  if (totalLen <= 30 && middle.length <= 3) return crumbs

  // Abbreviate middle segments to first letter
  const abbr = middle.map(c => ({ ...c, displayName: c.name.charAt(0) }))

  if (abbr.length <= 3) {
    return [root, ...abbr, last]
  }

  // Too many — collapse oldest to '...' and keep last 2 abbreviated
  return [root, { name: '...', path: null }, ...abbr.slice(-2), last]
})

// ── New Folder ────────────────────────────────────────────────────────────────
const mkdirDialog  = ref(false)
const mkdirName    = ref('')
const mkdirLoading = ref(false)
const mkdirError   = ref('')

function openMkdir() {
  mkdirName.value  = ''
  mkdirError.value = ''
  mkdirDialog.value = true
}

async function confirmMkdir() {
  const name = mkdirName.value.trim()
  if (!name) return
  mkdirLoading.value = true
  mkdirError.value   = ''
  try {
    await writeApi.mkdir(store.currentPath, name)
    mkdirDialog.value = false
    store.loadDirectory(store.currentPath)
  } catch (e) {
    mkdirError.value = e.response?.data?.detail || e.message
  } finally {
    mkdirLoading.value = false
  }
}

// ── New File ──────────────────────────────────────────────────────────────────
const touchDialog  = ref(false)
const touchName    = ref('')
const touchLoading = ref(false)
const touchError   = ref('')

function openTouch() {
  touchName.value  = ''
  touchError.value = ''
  touchDialog.value = true
}

async function confirmTouch() {
  const name = touchName.value.trim()
  if (!name) return
  touchLoading.value = true
  touchError.value   = ''
  try {
    await writeApi.touch(store.currentPath, name)
    touchDialog.value = false
    store.loadDirectory(store.currentPath)
  } catch (e) {
    touchError.value = e.response?.data?.detail || e.message
  } finally {
    touchLoading.value = false
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
const uploadInput   = ref(null)
const uploadLoading = ref(false)

function openUpload() {
  uploadInput.value.value = ''
  uploadInput.value.click()
}

async function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  if (!files.length) return
  uploadLoading.value = true
  try {
    await writeApi.upload(store.currentPath, files)
    store.loadDirectory(store.currentPath)
  } catch (err) {
    console.error('Upload failed', err)
  } finally {
    uploadLoading.value = false
  }
}
</script>

<template>
  <!-- Sidebar toggle -->
  <v-app-bar-nav-icon @click="$emit('toggle-sidebar')" />

  <!-- Breadcrumbs (shrinkable so long paths don't squash buttons) -->
  <div style="flex-shrink:1; min-width:0; overflow:hidden">
    <v-breadcrumbs :items="displayCrumbs" density="compact" class="pa-0" style="flex-wrap:nowrap">
      <template #prepend>
        <v-icon size="16" class="mr-1" color="medium-emphasis">mdi-folder-outline</v-icon>
      </template>
      <template #item="{ item }">
        <v-breadcrumbs-item
          class="text-body-2"
          :style="item.path != null ? { cursor:'pointer' } : { cursor:'default', opacity:0.5 }"
          @click="item.path != null && store.navigate(item.path)"
        >
          {{ item.displayName ?? item.name }}
          <v-tooltip v-if="item.displayName" activator="parent" location="bottom">
            {{ item.name }}
          </v-tooltip>
        </v-breadcrumbs-item>
      </template>
      <template #divider>
        <v-icon size="14" color="medium-emphasis">mdi-chevron-right</v-icon>
      </template>
    </v-breadcrumbs>
  </div>

  <v-spacer />

  <!-- Entry count -->
  <span class="text-caption text-medium-emphasis mr-3">
    {{ store.total }} items
  </span>

  <!-- Write mode actions -->
  <template v-if="store.writeMode">
    <v-chip size="x-small" color="warning" variant="tonal" class="mr-2 font-weight-bold">
      WRITE
    </v-chip>

    <v-btn icon size="small" class="mr-1" :loading="uploadLoading" @click="openUpload">
      <v-icon size="20">mdi-upload-outline</v-icon>
      <v-tooltip activator="parent">Upload files</v-tooltip>
    </v-btn>
    <input ref="uploadInput" type="file" multiple style="display:none" @change="onFilesSelected" />

    <v-btn icon size="small" class="mr-1" @click="openTouch">
      <v-icon size="20">mdi-file-plus-outline</v-icon>
      <v-tooltip activator="parent">New file</v-tooltip>
    </v-btn>

    <v-btn icon size="small" class="mr-1" @click="openMkdir">
      <v-icon size="20">mdi-folder-plus-outline</v-icon>
      <v-tooltip activator="parent">New folder</v-tooltip>
    </v-btn>
  </template>

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

  <!-- Logout (only when auth is enabled) -->
  <v-btn v-if="authStore.authRequired" icon size="small" class="mr-1" @click="authStore.logout">
    <v-icon size="20">mdi-logout</v-icon>
    <v-tooltip activator="parent">Logout</v-tooltip>
  </v-btn>

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

  <!-- New File dialog -->
  <v-dialog v-model="touchDialog" max-width="360">
    <v-card>
      <v-card-title class="pa-4">New File</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field
          v-model="touchName"
          label="File name"
          autofocus
          :error-messages="touchError"
          @keydown.enter="confirmTouch"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="touchDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="touchLoading" @click="confirmTouch">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- New Folder dialog -->
  <v-dialog v-model="mkdirDialog" max-width="360" @keydown.enter="confirmMkdir">
    <v-card>
      <v-card-title class="pa-4">New Folder</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field
          v-model="mkdirName"
          label="Folder name"
          autofocus
          :error-messages="mkdirError"
          @keydown.enter="confirmMkdir"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="mkdirDialog = false">Cancel</v-btn>
        <v-btn color="primary" :loading="mkdirLoading" @click="confirmMkdir">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
