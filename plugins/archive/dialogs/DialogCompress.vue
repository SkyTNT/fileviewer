<script setup>
import { ref, computed, watch, inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import CompressTreeNode from './CompressTreeNode.vue'

const props = defineProps({
  sources:    { type: Array,  default: () => [] },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t }        = useI18n()
const services     = inject('services')
const fileStore    = services?.get('explorer.state')
const archiveStore = services?.get('archive.state')
const archiveApi   = services?.get('archive.api')

const outputName  = ref('')
const format      = ref('zip')
const level       = ref(6)
const password    = ref('')
const showPwd     = ref(false)

const caps = ref({ formats: ['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz'], '7z_available': false })
archiveApi.getCapabilities().then(r => { caps.value = r.data }).catch(() => {})

const formatOptions = computed(() =>
  caps.value.formats.map(f => ({ title: f.toUpperCase(), value: f }))
)

const supportsPassword = computed(() =>
  format.value === '7z' || format.value === 'zip'
)

const defaultExtension = computed(() => {
  const map = { zip: '.zip', tar: '.tar', 'tar.gz': '.tar.gz', 'tar.bz2': '.tar.bz2', 'tar.xz': '.tar.xz', '7z': '.7z' }
  return map[format.value] || '.zip'
})

watch(format, () => {
  if (!outputName.value) return
  const exts = ['.zip', '.tar', '.tar.gz', '.tar.bz2', '.tar.xz', '.7z']
  let base = outputName.value
  for (const ext of exts) {
    if (base.toLowerCase().endsWith(ext)) { base = base.slice(0, -ext.length); break }
  }
  outputName.value = base + defaultExtension.value
})

const treeItems     = ref([])
const excludedPaths = ref(new Set())

onMounted(() => {
  if (props.sources.length) {
    const base = props.sources[0].name.split('.')[0] || 'archive'
    outputName.value = base + defaultExtension.value
  } else {
    outputName.value = 'archive' + defaultExtension.value
  }
  excludedPaths.value = new Set()
  treeItems.value = props.sources.map(s => ({
    ...s,
    check: 'checked',
    children: s.is_dir ? null : undefined,
    loaded: false,
  }))
})

function setCheckRecursive(node, state) {
  node.check = state
  if (state === 'unchecked') excludedPaths.value.add(node.path)
  else                       excludedPaths.value.delete(node.path)
  if (node.children) node.children.forEach(child => setCheckRecursive(child, state))
}

function recalcParent(node) {
  if (!node.children) return
  const checks = node.children.map(c => c.check)
  if (checks.every(c => c === 'checked'))        node.check = 'checked'
  else if (checks.every(c => c === 'unchecked')) node.check = 'unchecked'
  else                                           node.check = 'indeterminate'
  if (node.check !== 'unchecked') excludedPaths.value.delete(node.path)
  else                            excludedPaths.value.add(node.path)
}

function onToggle(item) {
  const newState = item.check === 'unchecked' ? 'checked' : 'unchecked'
  setCheckRecursive(item, newState)
  treeItems.value.forEach(root => { if (root.children) recalcParent(root) })
}

function startCompress() {
  const sources    = treeItems.value.filter(n => n.check !== 'unchecked').map(n => n.path)
  const excludes   = [...excludedPaths.value]
  const outputPath = fileStore.currentPath + '/' + outputName.value
  archiveStore.startCompress(
    sources, outputPath, format.value, level.value,
    supportsPassword.value ? password.value : null,
    excludes,
  )
  props.winManager?.close(props.winId)
}
</script>

<template>
  <div class="pa-4 d-flex flex-column" style="height:100%; overflow-y:auto">
    <v-text-field
      v-model="outputName"
      :label="t('archive.compress.outputName')"
      density="compact"
      variant="outlined"
      prepend-inner-icon="mdi-archive-outline"
      class="mb-3 flex-grow-0"
    />

    <div class="d-flex ga-3 mb-3">
      <v-select
        v-model="format"
        :items="formatOptions"
        :label="t('archive.compress.format')"
        density="compact"
        variant="outlined"
        :menu-props="{ zIndex: 3000 }"
        style="flex:1"
      />
      <div style="flex:1">
        <div class="text-caption text-medium-emphasis mb-1">
          {{ t('archive.compress.level') }}: {{ level }}
        </div>
        <v-slider v-model="level" :min="0" :max="9" :step="1" color="primary" hide-details thumb-label>
          <template #prepend><span class="text-caption">{{ t('archive.compress.levelFast') }}</span></template>
          <template #append><span class="text-caption">{{ t('archive.compress.levelBest') }}</span></template>
        </v-slider>
      </div>
    </div>

    <v-text-field
      v-if="supportsPassword"
      v-model="password"
      :type="showPwd ? 'text' : 'password'"
      autocomplete="new-password"
      :label="t('archive.compress.password')"
      density="compact"
      variant="outlined"
      prepend-inner-icon="mdi-lock-outline"
      :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
      class="mb-3 flex-grow-0"
      @click:append-inner="showPwd = !showPwd"
    />

    <div class="text-caption text-medium-emphasis mb-1 text-uppercase" style="letter-spacing:.05em">
      {{ t('archive.compress.contents') }}
    </div>
    <div class="compress-tree-wrap mb-4">
      <CompressTreeNode
        v-for="item in treeItems"
        :key="item.path"
        :item="item"
        :depth="0"
        @toggle="onToggle"
      />
    </div>

    <div class="d-flex justify-end ga-2 mt-auto">
      <v-btn variant="text" @click="props.winManager?.close(props.winId)">{{ t('dialog.cancel') }}</v-btn>
      <v-btn
        color="primary"
        variant="tonal"
        :disabled="!outputName || treeItems.every(n => n.check === 'unchecked')"
        @click="startCompress"
      >
        {{ t('archive.compress.compress') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.compress-tree-wrap {
  min-height: 100px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  padding: 4px;
}
</style>
