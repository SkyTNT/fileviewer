<script setup>
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { imagesApi } from '@/services/api.js'

const { t } = useI18n()

const dialog = ref(false)
const imgUrl = ref('')
const fileName = ref('')

const transform = reactive({ scale: 1, x: 0, y: 0 })
const dragging  = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
let fitScale = 1

function open(file) {
  imgUrl.value   = imagesApi.fullUrl(file.path)
  fileName.value = file.name
  fitScale = 1
  transform.scale = 1; transform.x = 0; transform.y = 0
  dialog.value = true
}

function onImgLoad(e) {
  const { naturalWidth: iw, naturalHeight: ih } = e.target
  if (iw && ih) {
    fitScale = Math.min(window.innerWidth / iw, window.innerHeight / ih)
    transform.scale = fitScale
    transform.x = 0; transform.y = 0
  }
}

function reset() {
  transform.scale = fitScale; transform.x = 0; transform.y = 0
}

function onWheel(e) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.12 : 0.89
  const newScale = Math.max(0.05, Math.min(20, transform.scale * factor))
  const ratio = newScale / transform.scale
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  transform.x = e.clientX - cx - (e.clientX - cx - transform.x) * ratio
  transform.y = e.clientY - cy - (e.clientY - cy - transform.y) * ratio
  transform.scale = newScale
}

function onMouseDown(e) {
  if (e.button !== 0) return
  dragging.value = true
  dragStart.x = e.clientX - transform.x
  dragStart.y = e.clientY - transform.y
}

function onMouseMove(e) {
  if (!dragging.value) return
  transform.x = e.clientX - dragStart.x
  transform.y = e.clientY - dragStart.y
}

function onMouseUp() { dragging.value = false }

function onDblClick() { reset() }

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" fullscreen :scrim="false">
    <div
      class="viewer-bg"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @dblclick="onDblClick"
    >
      <img
        :src="imgUrl"
        :alt="fileName"
        draggable="false"
        @load="onImgLoad"
        :style="{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          maxWidth: 'none',
          transformOrigin: 'center center',
        }"
        class="viewer-img"
      />
      <div class="viewer-toolbar">
        <span class="text-caption mr-4">{{ fileName }}</span>
        <v-btn icon size="small" variant="tonal" @click="reset" :title="t('imageViewer.resetView')">
          <v-icon>mdi-fit-to-screen</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="tonal" class="ml-1" @click="dialog = false" :title="t('imageViewer.close')">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
      <div class="zoom-hint text-caption text-grey">
        {{ t('imageViewer.zoomHint') }}
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.viewer-bg {
  width: 100%;
  height: 100%;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.viewer-img {
  position: absolute;
  max-width: none;
}
.viewer-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-surface), 0.75);
  padding: 6px 12px;
  border-radius: 8px;
  z-index: 10;
  backdrop-filter: blur(8px);
}
.zoom-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.4);
  padding: 4px 12px;
  border-radius: 12px;
}
</style>
