<template>
  <v-main>
    <div
      style="position:relative; height:100%"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <RootsView v-if="store.isAtHome" />
      <component :is="layoutComponent" v-else-if="layoutComponent" />

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

  <v-navigation-drawer
    :model-value="store.selectedEntries.length > 0 && !store.isAtHome && !store.mobileMultiSelectMode"
    location="end"
    :width="280"
    @update:model-value="v => { if (!v) store.selectEntry(null) }"
  >
    <FileDetail />
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import RootsView  from './components/RootsView.vue'
import FileDetail from './components/FileDetail.vue'

const services = inject('services')
const store = services.get('explorer.state')
const layoutRegistry = services.get('layout.registry')
const { t } = useI18n()

const layoutComponent = computed(() => layoutRegistry.active?.component ?? null)

const dragCounter  = ref(0)
const isDragging   = ref(false)
const canWriteHere = computed(() => store.writeMode && !store.isAtHome)

function onDragEnter(e) {
  if (!e.dataTransfer?.types?.includes('Files')) return
  dragCounter.value++
  isDragging.value = true
}
function onDragLeave() {
  if (--dragCounter.value <= 0) { dragCounter.value = 0; isDragging.value = false }
}
function onDrop(e) {
  dragCounter.value = 0
  isDragging.value = false
  if (!canWriteHere.value) return
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (files.length) {
    const uploadStore = services.get('upload.state')
    uploadStore?.addUploads(store.currentPath, files)
  }
}
</script>

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
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  margin: 8px;
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
.drop-fade-enter-active, .drop-fade-leave-active { transition: opacity 0.15s ease; }
.drop-fade-enter-from, .drop-fade-leave-to { opacity: 0; }
</style>
