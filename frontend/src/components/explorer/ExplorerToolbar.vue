<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../../stores/fileStore.js'
import { useAuthStore } from '../../stores/authStore.js'
import { useAppTheme, ACCENT_COLORS } from '../../composables/useAppTheme.js'
import { useWriteActions } from '../../composables/useWriteActions.js'
import DialogNewItem from '../dialogs/DialogNewItem.vue'

const emit = defineEmits(['toggle-sidebar'])
const store     = useFileStore()
const authStore = useAuthStore()
const { isDark, accentColor, toggleMode, setAccent } = useAppTheme()
const { mobile } = useDisplay()
const { t, locale } = useI18n()

// ── Language ──────────────────────────────────────────────────────────────────
function setLocale(lang) {
  locale.value = lang
  localStorage.setItem('fv-locale', lang)
}

// ── Filter ────────────────────────────────────────────────────────────────────
const showFilter     = ref(false)
const filterInput    = ref('')
const filterError    = ref('')
const filterFieldRef = ref(null)
let filterTimer      = null

function onDocMousedown(e) {
  if (!showFilter.value) return
  const el = filterFieldRef.value?.$el
  if (el && !el.contains(e.target)) {
    el.querySelector('input')?.blur()
  }
}

onMounted(() => document.addEventListener('mousedown', onDocMousedown))
onUnmounted(() => document.removeEventListener('mousedown', onDocMousedown))

watch(filterInput, (v) => {
  filterError.value = ''
  clearTimeout(filterTimer)
  if (v) {
    try { new RegExp(v) }
    catch { filterError.value = t('toolbar.invalidRegex'); return }
  }
  filterTimer = setTimeout(() => store.setFilter(v || ''), 300)
})

// Keep input in sync when store filter is cleared externally (e.g. on navigate)
watch(() => store.filterPattern, (v) => {
  if (!v) filterInput.value = ''
})

function toggleFilter() {
  showFilter.value = !showFilter.value
  if (!showFilter.value) {
    filterInput.value = ''
    filterError.value = ''
    store.setFilter('')
  }
}

function clearFilter() {
  filterInput.value = ''
  filterError.value = ''
  store.setFilter('')
}

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

// ── mkdir / touch / paste (via shared composable) ─────────────────────────────
const {
  mkdirDialog, mkdirName, mkdirLoading, mkdirError, openMkdir, confirmMkdir,
  touchDialog, touchName, touchLoading, touchError, openTouch, confirmTouch,
  doPaste,
} = useWriteActions()

// ── Upload ────────────────────────────────────────────────────────────────────
const uploadInput = ref(null)

function openUpload() {
  uploadInput.value.value = ''
  uploadInput.value.click()
}

function onFilesSelected(e) {
  const files = Array.from(e.target.files)
  if (files.length) store.addUploads(store.currentPath, files)
}

// ── Clipboard label ────────────────────────────────────────────────────────────
const clipboardLabel = computed(() => {
  if (!store.clipboard) return ''
  const n = store.clipboard.entries.length
  return n > 1 ? t('toolbar.nItems', { n }) : store.clipboard.entries[0].name
})
</script>

<template>
  <!-- Sidebar toggle -->
  <v-app-bar-nav-icon @click="$emit('toggle-sidebar')" />

  <!-- Breadcrumbs (shrinkable so long paths don't squash buttons) -->
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

  <!-- Hidden upload input (always present) -->
  <input ref="uploadInput" type="file" multiple style="display:none" @change="onFilesSelected" />

  <!-- ── Desktop controls ─────────────────────────────────────────────── -->
  <template v-if="!mobile">
    <!-- Entry count -->
    <span class="text-caption text-medium-emphasis mr-2" style="white-space:nowrap">
      {{ t('toolbar.items', { n: store.total }) }}
    </span>

    <!-- Filter input -->
    <v-text-field
      v-if="showFilter"
      ref="filterFieldRef"
      v-model="filterInput"
      density="compact"
      variant="outlined"
      :placeholder="t('toolbar.regexFilter')"
      hide-details
      clearable
      autofocus
      :error="!!filterError"
      style="max-width:200px; font-size:13px"
      class="mr-1"
      @click:clear="clearFilter"
      @keydown.escape="toggleFilter"
    >
      <v-tooltip v-if="filterError" activator="parent" location="bottom" color="error">
        {{ filterError }}
      </v-tooltip>
    </v-text-field>

    <!-- Filter toggle button -->
    <v-btn icon size="small" class="mr-1" :color="showFilter ? 'primary' : undefined" @click="toggleFilter">
      <v-icon size="20">{{ showFilter ? 'mdi-filter' : 'mdi-filter-outline' }}</v-icon>
      <v-tooltip activator="parent">{{ showFilter ? t('toolbar.closeFilter') : t('toolbar.filterFiles') }}</v-tooltip>
    </v-btn>

    <!-- Write mode actions (hidden at multi-root virtual root) -->
    <template v-if="store.writeMode && !store.isAtHome">
      <v-chip size="x-small" color="warning" variant="tonal" class="mr-2 font-weight-bold">
        WRITE
      </v-chip>
      <v-btn icon size="small" class="mr-1" @click="openUpload">
        <v-icon size="20">mdi-upload-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.upload') }}</v-tooltip>
      </v-btn>
      <v-btn icon size="small" class="mr-1" @click="openTouch">
        <v-icon size="20">mdi-file-plus-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.newFile') }}</v-tooltip>
      </v-btn>
      <v-btn icon size="small" class="mr-1" @click="openMkdir">
        <v-icon size="20">mdi-folder-plus-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.newFolder') }}</v-tooltip>
      </v-btn>
    </template>

    <!-- Clipboard paste (hidden at multi-root virtual root) -->
    <template v-if="store.writeMode && store.clipboard && !store.isAtHome">
      <v-chip
        size="x-small"
        :color="store.clipboard.action === 'cut' ? 'warning' : 'info'"
        variant="tonal"
        class="mr-1"
        closable
        @click:close="store.clearClipboard"
      >
        <v-icon start size="14">{{ store.clipboard.action === 'cut' ? 'mdi-content-cut' : 'mdi-content-copy' }}</v-icon>
        {{ clipboardLabel }}
      </v-chip>
      <v-btn icon size="small" class="mr-2" color="primary" @click="doPaste">
        <v-icon size="20">mdi-content-paste</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.paste') }}</v-tooltip>
      </v-btn>
    </template>

    <!-- View toggle -->
    <v-btn-toggle v-model="store.viewMode" mandatory density="compact" rounded="lg" class="mr-2" color="primary">
      <v-btn value="waterfall" size="small">
        <v-icon size="18">mdi-view-dashboard-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.waterfall') }}</v-tooltip>
      </v-btn>
      <v-btn value="list" size="small">
        <v-icon size="18">mdi-view-list-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.list') }}</v-tooltip>
      </v-btn>
    </v-btn-toggle>

    <!-- Logout -->
    <v-btn v-if="authStore.authRequired" icon size="small" class="mr-1" @click="authStore.logout">
      <v-icon size="20">mdi-logout</v-icon>
      <v-tooltip activator="parent">{{ t('toolbar.logout') }}</v-tooltip>
    </v-btn>

    <!-- Dark / Light toggle -->
    <v-btn icon size="small" class="mr-1" @click="toggleMode">
      <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      <v-tooltip activator="parent">{{ isDark ? t('toolbar.lightMode') : t('toolbar.darkMode') }}</v-tooltip>
    </v-btn>

    <!-- Language picker -->
    <v-menu :close-on-content-click="true" location="bottom end">
      <template #activator="{ props }">
        <v-btn icon size="small" class="mr-1" v-bind="props">
          <v-icon size="20">mdi-translate</v-icon>
          <v-tooltip activator="parent">{{ t('toolbar.language') }}</v-tooltip>
        </v-btn>
      </template>
      <v-list density="compact" min-width="120">
        <v-list-item
          title="English"
          :active="locale === 'en'"
          color="primary"
          rounded="lg"
          @click="setLocale('en')"
        />
        <v-list-item
          title="简体中文"
          :active="locale === 'zh-CN'"
          color="primary"
          rounded="lg"
          @click="setLocale('zh-CN')"
        />
        <v-list-item
          title="繁體中文"
          :active="locale === 'zh-TW'"
          color="primary"
          rounded="lg"
          @click="setLocale('zh-TW')"
        />
        <v-list-item
          title="日本語"
          :active="locale === 'ja'"
          color="primary"
          rounded="lg"
          @click="setLocale('ja')"
        />
      </v-list>
    </v-menu>

    <!-- Accent color picker -->
    <v-menu :close-on-content-click="false" location="bottom end">
      <template #activator="{ props }">
        <v-btn icon size="small" v-bind="props">
          <v-icon size="20" :color="accentColor">mdi-palette-outline</v-icon>
          <v-tooltip activator="parent">{{ t('toolbar.accentColor') }}</v-tooltip>
        </v-btn>
      </template>
      <v-card min-width="180" class="pa-3">
        <div class="text-caption text-medium-emphasis mb-2">{{ t('toolbar.accentColor') }}</div>
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

  <!-- ── Mobile overflow menu ─────────────────────────────────────────── -->
  <v-menu v-else :close-on-content-click="false" location="bottom end">
    <template #activator="{ props }">
      <v-btn icon size="small" v-bind="props">
        <v-icon size="20">mdi-dots-vertical</v-icon>
      </v-btn>
    </template>
    <v-card min-width="240" class="pa-1">

      <!-- Entry count + filter -->
      <div class="text-caption text-medium-emphasis px-3 pt-2 pb-1">{{ t('toolbar.items', { n: store.total }) }}</div>
      <div class="px-2 pb-2">
        <v-text-field
          v-model="filterInput"
          density="compact"
          variant="outlined"
          :placeholder="t('toolbar.regexFilter')"
          hide-details
          clearable
          :error="!!filterError"
          prepend-inner-icon="mdi-filter-outline"
          style="font-size:13px"
          @click:clear="clearFilter"
        >
          <v-tooltip v-if="filterError" activator="parent" location="bottom" color="error">
            {{ filterError }}
          </v-tooltip>
        </v-text-field>
      </div>

      <v-divider />

      <!-- View toggle -->
      <div class="px-2 py-2">
        <v-btn-toggle v-model="store.viewMode" mandatory density="compact" rounded="lg" color="primary" style="width:100%">
          <v-btn value="waterfall" size="small" style="flex:1">
            <v-icon size="18" class="mr-1">mdi-view-dashboard-outline</v-icon>
            {{ t('toolbar.waterfall') }}
          </v-btn>
          <v-btn value="list" size="small" style="flex:1">
            <v-icon size="18" class="mr-1">mdi-view-list-outline</v-icon>
            {{ t('toolbar.list') }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <!-- Write mode actions (hidden at multi-root virtual root) -->
      <template v-if="store.writeMode && !store.isAtHome">
        <v-divider />
        <div class="px-3 py-1 d-flex align-center ga-2">
          <v-chip size="x-small" color="warning" variant="tonal" class="font-weight-bold">WRITE</v-chip>
        </div>
        <v-list-item
          prepend-icon="mdi-upload-outline"
          :title="t('toolbar.upload')"
          density="compact"
          rounded="lg"
          @click="openUpload"
        />
        <v-list-item
          prepend-icon="mdi-file-plus-outline"
          :title="t('toolbar.newFile')"
          density="compact"
          rounded="lg"
          @click="openTouch"
        />
        <v-list-item
          prepend-icon="mdi-folder-plus-outline"
          :title="t('toolbar.newFolder')"
          density="compact"
          rounded="lg"
          @click="openMkdir"
        />
        <template v-if="store.clipboard && !store.isAtHome">
          <v-list-item
            :prepend-icon="store.clipboard.action === 'cut' ? 'mdi-content-cut' : 'mdi-content-copy'"
            :title="t('toolbar.pasteName', { name: clipboardLabel })"
            density="compact"
            rounded="lg"
            color="primary"
            @click="doPaste"
          />
          <v-list-item
            prepend-icon="mdi-close-circle-outline"
            :title="t('toolbar.clearClipboard')"
            density="compact"
            rounded="lg"
            @click="store.clearClipboard"
          />
        </template>
      </template>

      <v-divider />

      <!-- Dark / Light -->
      <v-list-item
        :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
        :title="isDark ? t('toolbar.lightMode') : t('toolbar.darkMode')"
        density="compact"
        rounded="lg"
        @click="toggleMode"
      />

      <!-- Language -->
      <v-list-item
        prepend-icon="mdi-translate"
        :title="t('toolbar.language')"
        density="compact"
        rounded="lg"
      >
        <template #append>
          <div class="d-flex ga-1">
            <v-btn
              size="x-small"
              :variant="locale === 'en' ? 'tonal' : 'text'"
              :color="locale === 'en' ? 'primary' : undefined"
              @click.stop="setLocale('en')"
            >EN</v-btn>
            <v-btn
              size="x-small"
              :variant="locale === 'zh-CN' ? 'tonal' : 'text'"
              :color="locale === 'zh-CN' ? 'primary' : undefined"
              @click.stop="setLocale('zh-CN')"
            >简体</v-btn>
            <v-btn
              size="x-small"
              :variant="locale === 'zh-TW' ? 'tonal' : 'text'"
              :color="locale === 'zh-TW' ? 'primary' : undefined"
              @click.stop="setLocale('zh-TW')"
            >繁中</v-btn>
            <v-btn
              size="x-small"
              :variant="locale === 'ja' ? 'tonal' : 'text'"
              :color="locale === 'ja' ? 'primary' : undefined"
              @click.stop="setLocale('ja')"
            >日本語</v-btn>
          </div>
        </template>
      </v-list-item>

      <!-- Accent color -->
      <v-list-item density="compact" class="pa-2">
        <div class="text-caption text-medium-emphasis mb-1 ml-1">{{ t('toolbar.accentColor') }}</div>
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
          </v-btn>
        </div>
      </v-list-item>

      <!-- Logout -->
      <template v-if="authStore.authRequired">
        <v-divider />
        <v-list-item
          prepend-icon="mdi-logout"
          :title="t('toolbar.logout')"
          density="compact"
          rounded="lg"
          base-color="error"
          @click="authStore.logout"
        />
      </template>
    </v-card>
  </v-menu>

  <DialogNewItem
    v-model="touchDialog"
    :title="t('dialog.newFile')"
    :label="t('dialog.fileName')"
    v-model:name="touchName"
    :loading="touchLoading"
    :error="touchError"
    @confirm="confirmTouch"
  />
  <DialogNewItem
    v-model="mkdirDialog"
    :title="t('dialog.newFolder')"
    :label="t('dialog.folderName')"
    v-model:name="mkdirName"
    :loading="mkdirLoading"
    :error="mkdirError"
    @confirm="confirmMkdir"
  />
</template>
