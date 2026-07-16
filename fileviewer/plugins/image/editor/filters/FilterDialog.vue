<script setup>
import { ref, watch, onMounted, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { runFilter } from './filterRunner.js'
import { useAdjustment } from '../adjustments/useAdjustment.js'

const props = defineProps({
  modelValue: { type: [Boolean, Object], default: null },
  filterId: String,
  filterLabel: String,
  params: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const values = ref({})

onMounted(() => {
  const v = {}
  for (const p of props.params) v[p.key] = p.default ?? 0
  values.value = v
})

const { preview, apply: commitApply, cancel: commitCancel } = useAdjustment(
  props.filterLabel,
  (layer, sel) => runFilter(props.filterId, values.value, layer, sel),
  () => {
    const v = {}
    for (const p of props.params) v[p.key] = p.default ?? 0
    values.value = v
  }
)

watch(values, () => preview(), { deep: true })

async function apply() {
  await commitApply()
  emit('update:modelValue', false)
}

function cancel() {
  commitCancel()
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="cancel" max-width="380">
    <v-card>
      <v-card-title>{{ filterLabel }}</v-card-title>
      <v-card-text>
        <template v-for="p in params" :key="p.key">
          <div v-if="!p.showWhen || values[p.showWhen.key] === p.showWhen.value" class="filter-row">
            <span class="filter-label">{{ p.label }}</span>
            <template v-if="p.type === 'select'">
              <v-btn-toggle v-model="values[p.key]" density="compact" mandatory class="flex-grow-1">
                <v-btn v-for="opt in p.options" :key="opt.value" :value="opt.value" size="small">{{ opt.label }}</v-btn>
              </v-btn-toggle>
            </template>
            <template v-else>
              <v-slider
                v-model="values[p.key]"
                :min="p.min" :max="p.max" :step="p.step || 1"
                hide-details density="compact" class="flex-grow-1"
              />
              <span class="filter-val">{{ typeof values[p.key] === 'number' ? values[p.key].toFixed(p.step < 1 ? 2 : 0) : values[p.key] }}</span>
            </template>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">{{ t('editor.cancel') }}</v-btn>
        <v-btn variant="tonal" color="primary" @click="apply">{{ t('editor.apply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.filter-label { font-size: 12px; width: 90px; flex-shrink: 0; }
.filter-val { font-size: 12px; width: 40px; text-align: right; flex-shrink: 0; }
</style>
