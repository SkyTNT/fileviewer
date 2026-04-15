<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { archiveApi } from '@/services/api.js'
import { useFileStore } from '@/plugins/file/store.js'
import { useNotificationStore } from '@/plugins/notification/store.js'
import CompressTreeNode from './CompressTreeNode.vue'

const props = defineProps({
  modelValue: Boolean,
  sources:    { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const store = useFileStore()
const { showSuccess, showError } = useNotificationStore()

// ── settings ──────────────────────────────────────────────────────────────────
const outputName  = ref('')
const format      = ref('zip')
const level       = ref(6)
const password    = ref('')
const showPwd     = ref(false)

// ── capabilities ─────────────────────────────────────────────────────────────
const caps = ref({ formats: ['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz'], zip_encrypt: false, '7z_available': false })
archiveApi.getCapabilities().then(r => { caps.value = r.data }).catch(() => {})

const formatOptions = computed(() =>
  caps.value.formats.map(f => ({
    title: f.toUpperCase().replace('TAR.', 'TAR.'),
    value: f,
  }))
)

const supportsPassword = computed(() =>
  format.value === '7z' || (format.value === 'zip' && caps.value.zip_encrypt)
)

const defaultExtension = computed(() => {
  const map = { zip: '.zip', tar: '.tar', 'tar.gz': '.tar.gz', 'tar.bz2': '.tar.bz2', 'tar.xz': '.tar.xz', '7z': '.7z' }
  return map[format.value] || '.zip'
})

// Auto-update output extension when format changes
watch(format, () => {
  if (!outputName.value) return
  const exts = ['.zip', '.tar', '.tar.gz', '.tar.bz2', '.tar.xz', '.7z']
  let base = outputName.value
  for (const ext of exts) {
    if (base.toLowerCase().endsWith(ext)) { base = base.slice(0, -ext.length); break }
  }
  outputName.value = base + defaultExtension.value
})

// ── tree state ────────────────────────────────────────────────────────────────
const treeItems = ref([])
const excludedPaths = ref(new Set())

watch(() => props.modelValue, (open) => {
  if (open) {
    initTree()
  }
})

function initTree() {
  // Build default output name from first source
  if (props.sources.length) {
    const first = props.sources[0]
    const base = first.name.split('.')[0] || 'archive'
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
}

// ── check logic ───────────────────────────────────────────────────────────────
function setCheckRecursive(node, state) {
  node.check = state
  if (state === 'unchecked') {
    excludedPaths.value.add(node.path)
  } else {
    excludedPaths.value.delete(node.path)
  }
  if (node.children) {
    node.children.forEach(child => setCheckRecursive(child, state))
  }
}

function recalcParent(node) {
  if (!node.children) return
  const checks = node.children.map(c => c.check)
  if (checks.every(c => c === 'checked'))       node.check = 'checked'
  else if (checks.every(c => c === 'unchecked')) node.check = 'unchecked'
  else                                           node.check = 'indeterminate'
  if (node.check !== 'unchecked') excludedPaths.value.delete(node.path)
  else excludedPaths.value.add(node.path)
}

function onToggle(item) {
  const newState = item.check === 'unchecked' ? 'checked' : 'unchecked'
  setCheckRecursive(item, newState)
  // Recalc ancestors in treeItems (shallow - only for top-level parents)
  treeItems.value.forEach(root => {
    if (root.children) recalcParent(root)
  })
}

// ── progress ─────────────────────────────────────────────────────────────────
const compressing = ref(false)
const progress    = ref({ done: 0, total: 0, name: '', errors: [], finished: false })

async function startCompress() {
  const sources    = treeItems.value.filter(n => n.check !== 'unchecked').map(n => n.path)
  const excludes   = [...excludedPaths.value]
  const outputPath = store.currentPath + '/' + outputName.value

  compressing.value = true
  progress.value    = { done: 0, total: 0, name: '', errors: [], finished: false }

  try {
    const res = await archiveApi.create(
      sources, outputPath, format.value, level.value,
      supportsPassword.value ? password.value : null,
      excludes,
    )

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'progress') {
            progress.value.done  = data.done
            progress.value.total = data.total
            progress.value.name  = data.name
          } else if (data.type === 'error') {
            progress.value.errors.push(data.message || data.name || 'Error')
          } else if (data.type === 'warning') {
            progress.value.errors.push('⚠ ' + data.message)
          } else if (data.type === 'done') {
            progress.value.finished = true
            store.refresh()
            store.invalidateTree?.()
          }
        } catch { /* bad SSE */ }
      }
    }
  } catch (e) {
    progress.value.errors.push(e.message)
    progress.value.finished = true
  }
}

function closeDialog() {
  compressing.value = false
  progress.value = { done: 0, total: 0, name: '', errors: [], finished: false }
  emit('update:modelValue', false)
}

const progressPercent = computed(() =>
  progress.value.total > 0 ? Math.round((progress.value.done / progress.value.total) * 100) : 0
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    persistent
    @update:model-value="v => { if (!v) closeDialog() }"
  >
    <v-card>
      <v-card-title class="d-flex align-center ga-2 pt-4 pb-2 px-4">
        <v-icon>mdi-archive-plus-outline</v-icon>
        {{ t('archive.compress.title') }}
      </v-card-title>

      <!-- ── Settings form ─────────────────────────────────────────────── -->
      <template v-if="!compressing">
        <v-card-text class="pt-2">
          <!-- Output filename -->
          <v-text-field
            v-model="outputName"
            :label="t('archive.compress.outputName')"
            density="compact"
            variant="outlined"
            prepend-inner-icon="mdi-archive-outline"
            class="mb-3"
          />

          <!-- Format + Level row -->
          <div class="d-flex ga-3 mb-3">
            <v-select
              v-model="format"
              :items="formatOptions"
              :label="t('archive.compress.format')"
              density="compact"
              variant="outlined"
              style="flex:1"
            />
            <div style="flex:1">
              <div class="text-caption text-medium-emphasis mb-1">
                {{ t('archive.compress.level') }}: {{ level }}
              </div>
              <v-slider
                v-model="level"
                :min="0"
                :max="9"
                :step="1"
                color="primary"
                hide-details
                thumb-label
              >
                <template #prepend>
                  <span class="text-caption">{{ t('archive.compress.levelFast') }}</span>
                </template>
                <template #append>
                  <span class="text-caption">{{ t('archive.compress.levelBest') }}</span>
                </template>
              </v-slider>
            </div>
          </div>

          <!-- Password (only if supported) -->
          <v-text-field
            v-if="supportsPassword || format === 'zip'"
            v-model="password"
            :type="showPwd ? 'text' : 'password'"
            autocomplete="off"
            :label="t('archive.compress.password')"
            :hint="!supportsPassword && format === 'zip' ? t('archive.compress.pwdZipNote') : ''"
            :disabled="!supportsPassword"
            density="compact"
            variant="outlined"
            prepend-inner-icon="mdi-lock-outline"
            :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
            persistent-hint
            class="mb-3"
            @click:append-inner="showPwd = !showPwd"
          />

          <!-- Contents tree -->
          <div class="text-caption text-medium-emphasis mb-1 text-uppercase" style="letter-spacing:.05em">
            {{ t('archive.compress.contents') }}
          </div>
          <div class="compress-tree-wrap">
            <CompressTreeNode
              v-for="item in treeItems"
              :key="item.path"
              :item="item"
              :depth="0"
              @toggle="onToggle"
            />
          </div>
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="closeDialog">{{ t('dialog.cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :disabled="!outputName || treeItems.every(n => n.check === 'unchecked')"
            @click="startCompress"
          >
            {{ t('archive.compress.compress') }}
          </v-btn>
        </v-card-actions>
      </template>

      <!-- ── Progress view ─────────────────────────────────────────────── -->
      <template v-else>
        <v-card-text>
          <div class="d-flex align-center mb-3 ga-2">
            <v-icon color="primary">mdi-archive-plus-outline</v-icon>
            <span class="text-body-2 font-weight-medium">{{ outputName }}</span>
          </div>
          <v-progress-linear
            :model-value="progressPercent"
            :indeterminate="progress.total === 0 && !progress.finished"
            color="primary"
            height="8"
            rounded
            class="mb-2"
          />
          <div class="text-caption text-medium-emphasis mb-2">
            {{ progress.done }} / {{ progress.total || '…' }}
            <template v-if="progress.name">— {{ progress.name }}</template>
          </div>
          <div v-for="(err, i) in progress.errors.slice(0, 5)" :key="i"
               class="text-caption"
               :class="err.startsWith('⚠') ? 'text-warning' : 'text-error'"
          >
            {{ err }}
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4" v-if="progress.finished">
          <v-spacer />
          <v-btn color="primary" variant="tonal" @click="closeDialog">
            {{ t('archive.compress.done') }}
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.compress-tree-wrap {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  padding: 4px;
}
</style>
