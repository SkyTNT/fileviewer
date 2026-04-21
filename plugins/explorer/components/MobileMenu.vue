<script setup>
import { ref, computed, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const services       = inject('services')
const store          = services.get('explorer.state')
const layoutRegistry = services.get('layout.registry')
const themeService   = services.get('theme.service')
const authState      = services.get('auth.state')
const { isDark, accentColor, ACCENT_COLORS, toggleMode, setAccent } = themeService.useAppTheme()
const { t, locale } = useI18n()
const { mobile }    = useDisplay()

const SORT_OPTIONS = [
  { value: 'name',     icon: 'mdi-sort-alphabetical-variant',    label: 'toolbar.sortName' },
  { value: 'size',     icon: 'mdi-sort-numeric-variant',         label: 'toolbar.sortSize' },
  { value: 'modified', icon: 'mdi-sort-clock-ascending-outline', label: 'toolbar.sortModified' },
  { value: 'type',     icon: 'mdi-file-outline',                 label: 'toolbar.sortType' },
]

function onSortClick(by) {
  if (store.sortBy === by) store.setSort(by, store.sortOrder === 'asc' ? 'desc' : 'asc')
  else store.setSort(by, 'asc')
}

function setLocale(lang) {
  locale.value = lang
  localStorage.setItem('fv-locale', lang)
}

const filterInput = ref('')
const filterError = ref('')
let filterTimer   = null

watch(filterInput, (v) => {
  filterError.value = ''
  clearTimeout(filterTimer)
  if (v) {
    try { new RegExp(v) }
    catch { filterError.value = t('toolbar.invalidRegex'); return }
  }
  filterTimer = setTimeout(() => store.setFilter(v || ''), 300)
})

watch(() => store.filterPattern, (v) => { if (!v) filterInput.value = '' })

function clearFilter() { filterInput.value = ''; filterError.value = ''; store.setFilter('') }

const clipboardLabel = computed(() => {
  if (!store.clipboard) return ''
  const n = store.clipboard.entries.length
  return n > 1 ? t('toolbar.nItems', { n }) : store.clipboard.entries[0].name
})

const clipboardIcon = computed(() => {
  const a = store.clipboard?.action
  return a === 'cut' ? 'mdi-content-cut' : a === 'link' ? 'mdi-link-variant' : 'mdi-content-copy'
})

const events = inject('events')
const menuOpen = ref(false)

function triggerUpload() { menuOpen.value = false; events?.emit('upload:trigger') }
function openTouch()     { menuOpen.value = false; services.get('write.state').openTouch() }
function openMkdir()     { menuOpen.value = false; services.get('write.state').openMkdir() }
function doPaste()       { menuOpen.value = false; services.get('write.state').doPaste() }
</script>

<template>
  <!-- Mobile multi-select mode -->
  <template v-if="mobile && store.mobileMultiSelectMode">
    <v-btn icon size="small" @click="store.selectAll()">
      <v-icon size="20">mdi-select-all</v-icon>
      <v-tooltip activator="parent">{{ t('toolbar.selectAll') }}</v-tooltip>
    </v-btn>
    <v-btn icon size="small" @click="store.invertSelection()">
      <v-icon size="20">mdi-select-inverse</v-icon>
      <v-tooltip activator="parent">{{ t('toolbar.invertSelect') }}</v-tooltip>
    </v-btn>
    <v-btn icon size="small" color="primary" @click="store.exitMobileMultiSelect(true)">
      <v-icon size="20">mdi-check</v-icon>
      <v-tooltip activator="parent">{{ t('toolbar.doneSelect') }}</v-tooltip>
    </v-btn>
    <v-btn icon size="small" @click="store.exitMobileMultiSelect(false)">
      <v-icon size="20">mdi-close</v-icon>
      <v-tooltip activator="parent">{{ t('toolbar.cancelSelect') }}</v-tooltip>
    </v-btn>
  </template>

  <!-- Mobile overflow menu -->
  <v-menu v-else-if="mobile" v-model="menuOpen" :close-on-content-click="false" location="bottom end">
    <template #activator="{ props }">
      <v-btn icon size="small" v-bind="props">
        <v-icon size="20">mdi-dots-vertical</v-icon>
      </v-btn>
    </template>
    <v-card min-width="240" class="pa-1">

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
          <v-tooltip v-if="filterError" activator="parent" location="bottom" color="error">{{ filterError }}</v-tooltip>
        </v-text-field>
      </div>

      <template v-if="!store.isAtHome">
        <v-list-item
          prepend-icon="mdi-checkbox-multiple-outline"
          :title="t('toolbar.multiSelect')"
          density="compact"
          rounded="lg"
          @click="store.enterMobileMultiSelect()"
        />
      </template>

      <v-divider />

      <div class="text-caption text-medium-emphasis px-3 pt-2 pb-1">{{ t('toolbar.sortBy') }}</div>
      <v-list-item
        v-for="opt in SORT_OPTIONS"
        :key="opt.value"
        :prepend-icon="opt.icon"
        :title="t(opt.label)"
        :active="store.sortBy === opt.value"
        color="primary"
        density="compact"
        rounded="lg"
        @click="onSortClick(opt.value)"
      >
        <template #append>
          <v-icon v-if="store.sortBy === opt.value" size="16">
            {{ store.sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
          </v-icon>
        </template>
      </v-list-item>

      <v-divider />

      <div class="px-2 py-2">
        <v-btn-toggle
          :model-value="layoutRegistry.activeId"
          mandatory
          density="compact"
          rounded="lg"
          color="primary"
          style="width:100%"
          @update:model-value="key => layoutRegistry.setActive(key)"
        >
          <v-btn
            v-for="layout in layoutRegistry.layouts"
            :key="layout.key"
            :value="layout.key"
            size="small"
            style="flex:1"
          >
            <v-icon size="18" class="mr-1">{{ layout.icon }}</v-icon>
            {{ t(layout.label) }}
          </v-btn>
        </v-btn-toggle>
      </div>

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
          @click="triggerUpload"
        />
        <v-list-item
          prepend-icon="mdi-file-plus-outline"
          :title="t('toolbar.newFile')"
          density="compact"
          rounded="lg"
          @click="openTouch()"
        />
        <v-list-item
          prepend-icon="mdi-folder-plus-outline"
          :title="t('toolbar.newFolder')"
          density="compact"
          rounded="lg"
          @click="openMkdir()"
        />
        <template v-if="store.clipboard">
          <v-list-item
            :prepend-icon="clipboardIcon"
            :title="t('toolbar.pasteName', { name: clipboardLabel })"
            density="compact"
            rounded="lg"
            color="primary"
            @click="doPaste()"
          />
          <v-list-item
            prepend-icon="mdi-close-circle-outline"
            :title="t('toolbar.clearClipboard')"
            density="compact"
            rounded="lg"
            @click="store.clearClipboard()"
          />
        </template>
      </template>

      <v-divider />

      <v-list-item prepend-icon="mdi-translate" :title="t('toolbar.language')" density="compact" rounded="lg">
        <template #append>
          <div class="d-flex ga-1">
            <v-btn
              v-for="[code, label] in [['en','EN'],['zh-CN','简体'],['zh-TW','繁中'],['ja','日本語']]"
              :key="code"
              size="x-small"
              :variant="locale === code ? 'tonal' : 'text'"
              :color="locale === code ? 'primary' : undefined"
              @click.stop="setLocale(code)"
            >{{ label }}</v-btn>
          </div>
        </template>
      </v-list-item>

      <v-list-item
        :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
        :title="isDark ? t('toolbar.lightMode') : t('toolbar.darkMode')"
        density="compact"
        rounded="lg"
        @click="toggleMode"
      />

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
            <v-tooltip activator="parent">{{ c.label }}</v-tooltip>
          </v-btn>
        </div>
      </v-list-item>

      <template v-if="authState?.authRequired">
        <v-divider />
        <v-list-item
          prepend-icon="mdi-logout"
          :title="t('toolbar.logout')"
          density="compact"
          rounded="lg"
          base-color="error"
          @click="authState.logout()"
        />
      </template>

    </v-card>
  </v-menu>
</template>
