<script setup>
import { inject, computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CropTool from '../tools/CropTool.js'
import MoveTool from '../tools/MoveTool.js'

const state = inject('editorState')
const toolCtx = inject('editorToolCtx')
const { t } = useI18n()

const availableFonts = ref([
  'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia',
])

// Load system fonts if API is available
if ('queryLocalFonts' in window) {
  window.queryLocalFonts().then(fonts => {
    const names = new Set()
    fonts.forEach(f => names.add(f.family))
    availableFonts.value = [...names].sort()
  }).catch(() => {
    // Fallback to common fonts if permission denied
  })
}

const tool = computed(() => state.activeTool)
const hasCrop = computed(() => { void state.paintTick; return CropTool.hasCrop() })
const isTransforming = computed(() => { void state.paintTick; return MoveTool.isTransforming() })
const isLockAspect = computed(() => { void state.paintTick; return MoveTool.isLockAspect() })

function toggleLockAspect() {
  MoveTool.toggleLockAspect()
  toolCtx.value.invalidate()
}

const BLEND_MODES = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color Dodge', value: 'color-dodge' },
  { label: 'Color Burn', value: 'color-burn' },
  { label: 'Hard Light', value: 'hard-light' },
  { label: 'Soft Light', value: 'soft-light' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' },
]

const SELECT_MODES = [
  { label: 'New', value: 'replace' },
  { label: 'Add', value: 'add' },
  { label: 'Subtract', value: 'subtract' },
]

const GRADIENT_TYPES = ['linear', 'radial']
const SHAPE_TYPES = ['rect', 'ellipse', 'line']
</script>

<template>
  <div class="options-bar">
    <!-- Move tool -->
    <template v-if="tool === 'move'">
      <template v-if="isTransforming">
        <v-btn size="small" variant="tonal" color="primary" @click="MoveTool.applyTransform(state, toolCtx)">
          {{ t('editor.apply') }}
        </v-btn>
        <v-btn size="small" variant="text" class="ml-1" @click="MoveTool.cancelTransform(state, toolCtx)">
          {{ t('editor.cancel') }}
        </v-btn>
        <v-divider vertical class="mx-2" />
        <v-btn
          size="small"
          :variant="isLockAspect ? 'tonal' : 'text'"
          :color="isLockAspect ? 'primary' : undefined"
          :icon="isLockAspect ? 'mdi-lock' : 'mdi-lock-open-outline'"
          density="compact"
          @click="toggleLockAspect"
        />
        <span class="opt-label ml-1">{{ t('editor.lockAspect') }}</span>
        <v-divider vertical class="mx-2" />
        <span class="opt-label">{{ t('editor.transformHint') }}</span>
      </template>
      <template v-else>
        <v-btn
          size="small" variant="tonal"
          @click="MoveTool.startTransform(state, toolCtx)"
        >
          {{ t('editor.freeTransform') }}
        </v-btn>
      </template>
    </template>

    <!-- Brush options -->
    <template v-if="tool === 'brush' || tool === 'eraser'">
      <span class="opt-label">{{ t('editor.size') }}</span>
      <v-slider
        v-model="state[tool === 'brush' ? 'brushSize' : 'eraserSize']"
        :min="1" :max="500" :step="1" hide-details density="compact"
        style="width:100px" class="mx-1"
      />
      <span class="opt-val">{{ state[tool === 'brush' ? 'brushSize' : 'eraserSize'] }}</span>

      <v-divider vertical class="mx-2" />

      <span class="opt-label">{{ t('editor.hardness') }}</span>
      <v-slider
        v-model="state[tool === 'brush' ? 'brushHardness' : 'eraserHardness']"
        :min="0" :max="1" :step="0.01" hide-details density="compact"
        style="width:80px" class="mx-1"
      />

      <template v-if="tool === 'brush'">
        <v-divider vertical class="mx-2" />
        <span class="opt-label">{{ t('editor.opacity') }}</span>
        <v-slider v-model="state.brushOpacity" :min="0" :max="1" :step="0.01" hide-details density="compact" style="width:80px" class="mx-1" />
        <v-divider vertical class="mx-2" />
        <span class="opt-label">{{ t('editor.flow') }}</span>
        <v-slider v-model="state.brushFlow" :min="0.01" :max="1" :step="0.01" hide-details density="compact" style="width:80px" class="mx-1" />
      </template>
    </template>

    <!-- Selection mode -->
    <template v-else-if="['rect-select','ellipse-select','lasso','magic-wand'].includes(tool)">
      <v-btn-toggle v-model="state.selectionMode" density="compact" rounded="lg" mandatory>
        <v-btn v-for="m in SELECT_MODES" :key="m.value" :value="m.value" size="small">{{ m.label }}</v-btn>
      </v-btn-toggle>
      <template v-if="tool === 'magic-wand'">
        <v-divider vertical class="mx-2" />
        <span class="opt-label">{{ t('editor.tolerance') }}</span>
        <v-slider v-model="state.wandTolerance" :min="0" :max="255" :step="1" hide-details density="compact" style="width:80px" class="mx-1" />
        <span class="opt-val">{{ state.wandTolerance }}</span>
      </template>
    </template>

    <!-- Fill options -->
    <template v-else-if="tool === 'fill'">
      <span class="opt-label">{{ t('editor.tolerance') }}</span>
      <v-slider v-model="state.fillTolerance" :min="0" :max="255" :step="1" hide-details density="compact" style="width:80px" class="mx-1" />
      <span class="opt-val">{{ state.fillTolerance }}</span>
    </template>

    <!-- Crop: apply button -->
    <template v-else-if="tool === 'crop'">
      <template v-if="hasCrop">
        <v-btn size="small" variant="tonal" color="primary" @click="CropTool.applyCrop(toolCtx)">
          {{ t('editor.applyCrop') }}
        </v-btn>
        <v-btn size="small" variant="text" class="ml-1" @click="CropTool.cancelCrop(toolCtx)">
          {{ t('editor.cancel') }}
        </v-btn>
      </template>
      <span v-else class="opt-label">{{ t('editor.cropHint') }}</span>
    </template>

    <!-- Text -->
    <template v-else-if="tool === 'text'">
      <v-autocomplete
        v-model="state.textFont"
        :items="availableFonts"
        density="compact" variant="outlined" hide-details label="Font"
        style="width:160px" class="mr-2"
        auto-select-first
      />
      <v-text-field v-model.number="state.textSize" density="compact" variant="outlined" hide-details label="Size" type="number" style="width:70px" class="mr-2" />
      <v-btn :icon="state.textBold ? 'mdi-format-bold' : 'mdi-format-bold'" :variant="state.textBold ? 'tonal' : 'text'" size="small" @click="state.textBold = !state.textBold" />
      <v-btn :icon="state.textItalic ? 'mdi-format-italic' : 'mdi-format-italic'" :variant="state.textItalic ? 'tonal' : 'text'" size="small" @click="state.textItalic = !state.textItalic" />
    </template>

    <!-- Shape -->
    <template v-else-if="tool === 'shape'">
      <v-btn-toggle v-model="state.shapeType" density="compact" rounded="lg" mandatory>
        <v-btn v-for="s2 in SHAPE_TYPES" :key="s2" :value="s2" size="small">{{ s2 }}</v-btn>
      </v-btn-toggle>
      <v-divider vertical class="mx-2" />
      <v-checkbox v-model="state.shapeFill" label="Fill" density="compact" hide-details class="mr-2" />
      <v-checkbox v-model="state.shapeStroke" label="Stroke" density="compact" hide-details class="mr-2" />
      <template v-if="state.shapeStroke">
        <v-slider v-model="state.strokeWidth" :min="1" :max="50" :step="1" hide-details density="compact" style="width:80px" class="mx-1" />
        <span class="opt-val">{{ state.strokeWidth }}px</span>
      </template>
    </template>

    <!-- Gradient -->
    <template v-else-if="tool === 'gradient'">
      <v-btn-toggle v-model="state.gradientType" density="compact" rounded="lg" mandatory>
        <v-btn v-for="g in GRADIENT_TYPES" :key="g" :value="g" size="small">{{ g }}</v-btn>
      </v-btn-toggle>
    </template>
  </div>
</template>

<style scoped>
.options-bar {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  padding: 2px 8px;
  min-height: 36px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  gap: 4px;
  flex-shrink: 0;
  overflow: hidden;
}
.opt-label { font-size: 11px; color: rgba(255,255,255,0.6); white-space: nowrap; flex-shrink: 0; }
.opt-val { font-size: 11px; color: rgba(255,255,255,0.8); min-width: 28px; text-align: right; flex-shrink: 0; }
</style>
