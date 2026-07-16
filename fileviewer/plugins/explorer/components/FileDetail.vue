<script setup>
import { computed, ref, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const fileStore = inject('services')?.get('explorer.state')
const { t }     = useI18n()
const services  = inject('services')
const ft        = services?.get('file.types')

const singleActions = computed(() => {
  const reg = services?.get('action.registry')
  return reg ? reg.resolveDetail() : []
})
const multiActions = computed(() => {
  const reg = services?.get('action.registry')
  return reg ? reg.resolveDetail() : []
})

const file    = computed(() => fileStore.selectedEntry)
const isMulti = computed(() => fileStore.selectedEntries.length > 1)

const typeIcon    = computed(() => ft?.icon(file.value?.type))
const typeColor   = computed(() => ft?.color(file.value?.type, 'surface-variant'))
const formatSize  = (bytes) => ft?.formatBytes(bytes, '—') ?? '—'
const fmtDate     = (ts)    => ft?.formatDate(ts, '—') ?? '—'

const previewUrl    = computed(() => ft?.thumbnailUrl(file.value, 400) ?? null)
const extraFields   = computed(() => ft?.extraDetailFields(file.value) ?? [])
const detailSections = computed(() => ft?.detailSections(file.value) ?? [])
const imgError      = ref(false)
watch(file, () => { imgError.value = false })
</script>

<template>
  <!-- ── Multi-select panel ───────────────────────────────────────────────── -->
  <div v-if="isMulti" class="detail-panel">
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">{{ t('detail.itemsSelected', { n: fileStore.selectedEntries.length }) }}</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="fileStore.clearSelection()">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <div class="preview-area pa-4 d-flex align-center justify-center">
      <v-icon color="primary" size="80">mdi-checkbox-multiple-marked-outline</v-icon>
    </div>

    <v-divider />

    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <template v-for="row in multiActions" :key="row.id">
        <div v-if="row.type === 'pair'" class="d-flex ga-2">
          <v-btn
            v-for="btn in row.items" :key="btn.id"
            :color="btn.color" variant="tonal" style="flex:1"
            :prepend-icon="btn.icon" @click="btn.execute()"
          >{{ btn.label() }}</v-btn>
        </div>
        <v-btn v-else :color="row.color" variant="tonal" block
               :prepend-icon="row.icon" @click="row.execute()">{{ row.label() }}</v-btn>
      </template>
    </div>

    <!-- Summary -->
    <div class="info-list pa-3">
      <div v-if="fileStore.selectedEntries.filter(e => !e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.files') }}</span>
        <span class="info-value text-body-2">{{ fileStore.selectedEntries.filter(e => !e.is_dir).length }}</span>
      </div>
      <div v-if="fileStore.selectedEntries.filter(e => e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.folders') }}</span>
        <span class="info-value text-body-2">{{ fileStore.selectedEntries.filter(e => e.is_dir).length }}</span>
      </div>
      <div v-if="fileStore.selectedEntries.filter(e => !e.is_dir).length" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.totalSize') }}</span>
        <span class="info-value text-body-2">{{ formatSize(fileStore.selectedEntries.reduce((s, e) => s + (e.size ?? 0), 0)) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.selected') }}</span>
        <div class="d-flex flex-column ga-1 mt-1">
          <span
            v-for="entry in fileStore.selectedEntries.slice(0, 10)" :key="entry.path"
            class="info-value text-body-2 text-truncate" :title="entry.name"
          >
            <v-icon size="14" class="mr-1" :color="entry.is_dir ? 'primary' : undefined">
              {{ entry.is_dir ? 'mdi-folder' : 'mdi-file-outline' }}
            </v-icon>{{ entry.name }}
          </span>
          <span v-if="fileStore.selectedEntries.length > 10" class="text-caption text-medium-emphasis">
            {{ t('detail.andMore', { n: fileStore.selectedEntries.length - 10 }) }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Single-select panel ──────────────────────────────────────────────── -->
  <div v-else-if="file" class="detail-panel">
    <div class="d-flex align-center px-3 pt-3 pb-1">
      <span class="text-subtitle-2 font-weight-bold">{{ t('detail.details') }}</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="fileStore.selectEntry(null)">
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>

    <v-divider />

    <!-- Preview -->
    <div class="preview-area pa-4 d-flex align-center justify-center">
      <img
        v-if="previewUrl && !imgError"
        :src="previewUrl"
        class="preview-img" :alt="file.name"
        @error="imgError = true"
      />
      <v-icon v-else :color="typeColor" size="80">{{ typeIcon }}</v-icon>
    </div>

    <v-divider />

    <!-- Action buttons -->
    <div class="px-3 pt-3 d-flex flex-column ga-2">
      <template v-for="row in singleActions" :key="row.id">
        <div v-if="row.type === 'pair'" class="d-flex ga-2">
          <v-btn
            v-for="btn in row.items" :key="btn.id"
            :color="btn.color" variant="tonal" style="flex:1"
            :prepend-icon="btn.icon" @click="btn.execute()"
          >{{ btn.label() }}</v-btn>
        </div>
        <v-btn
          v-else-if="row.type === 'link'"
          :href="row.href" :download="row.downloadAttr"
          :color="row.color" variant="tonal" block :prepend-icon="row.icon"
        >{{ row.label() }}</v-btn>
        <v-btn
          v-else
          :loading="row.loading" :color="row.color" variant="tonal" block
          :prepend-icon="row.icon" @click="row.execute()"
        >{{ row.label() }}</v-btn>
      </template>
    </div>

    <!-- Info rows -->
    <div class="info-list pa-3">
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.name') }}</span>
        <span class="info-value text-body-2 text-wrap">{{ file.name }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.type') }}</span>
        <div class="d-flex align-center ga-1">
          <v-chip size="x-small" :color="typeColor" variant="tonal" label>{{ file.type }}</v-chip>
          <v-chip v-if="file.is_symlink" size="x-small" color="medium-emphasis" variant="tonal" label>
            <v-icon start size="11">mdi-link-variant</v-icon>symlink
          </v-chip>
        </div>
      </div>
      <div v-if="file.extension" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.extension') }}</span>
        <span class="info-value text-body-2">{{ file.extension }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.size') }}</span>
        <span class="info-value text-body-2">{{ formatSize(file.size) }}</span>
      </div>
      <div v-if="file.img_w && file.img_h" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.dimensions') }}</span>
        <span class="info-value text-body-2">{{ file.img_w }} × {{ file.img_h }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.modified') }}</span>
        <span class="info-value text-body-2">{{ fmtDate(file.modified) }}</span>
      </div>
      <div class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t('detail.path') }}</span>
        <span class="info-value text-body-2 text-wrap path-text">{{ file.path || '/' }}</span>
      </div>
      <div v-for="field in extraFields" :key="field.key" class="info-row">
        <span class="info-label text-caption text-medium-emphasis">{{ t(field.label) }}</span>
        <span class="info-value text-body-2">{{ field.value }}</span>
      </div>
    </div>

    <!-- Type-specific detail sections from file.types registry -->
    <template v-for="section in detailSections" :key="section.id">
      <v-divider class="mt-1" />
      <component :is="section.component" v-bind="section.props" />
    </template>
  </div>
</template>

<style scoped>
.detail-panel { height: 100%; overflow-y: auto; }
.preview-area { min-height: 160px; }
.preview-img  { width: 100%; height: auto; border-radius: 8px; display: block; }
.info-list    { display: flex; flex-direction: column; gap: 12px; }
.info-row     { display: flex; flex-direction: column; gap: 2px; }
.info-label   { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.info-value   { word-break: break-all; }
.path-text    { font-family: 'Roboto Mono', monospace; font-size: 12px; }
</style>
