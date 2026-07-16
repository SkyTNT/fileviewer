<script setup>
import { ref, watch, inject, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const store = inject('services').get('explorer.state')
const { t } = useI18n()
const { mobile } = useDisplay()

const showFilter     = ref(false)
const filterInput    = ref('')
const filterError    = ref('')
const filterFieldRef = ref(null)
let filterTimer      = null

function onDocMousedown(e) {
  if (!showFilter.value) return
  const el = filterFieldRef.value?.$el
  if (el && !el.contains(e.target)) el.querySelector('input')?.blur()
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

watch(() => store.filterPattern, (v) => { if (!v) filterInput.value = '' })

function toggleFilter() {
  showFilter.value = !showFilter.value
  if (!showFilter.value) { filterInput.value = ''; filterError.value = ''; store.setFilter('') }
}
function clearFilter() { filterInput.value = ''; filterError.value = ''; store.setFilter('') }
</script>

<template>
  <template v-if="!mobile">
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
    <v-tooltip v-if="filterError" activator="parent" location="bottom" color="error">{{ filterError }}</v-tooltip>
  </v-text-field>

  <v-btn icon size="small" class="mr-1" :color="showFilter ? 'primary' : undefined" @click="toggleFilter">
    <v-icon size="20">{{ showFilter ? 'mdi-filter' : 'mdi-filter-outline' }}</v-icon>
    <v-tooltip activator="parent">{{ showFilter ? t('toolbar.closeFilter') : t('toolbar.filterFiles') }}</v-tooltip>
  </v-btn>
  </template>
</template>
