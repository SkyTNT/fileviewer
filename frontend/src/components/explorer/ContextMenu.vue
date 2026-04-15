<script setup>
import { computed, ref } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import { useActionContext } from '../../composables/useActionContext.js'
import { resolveMenuActions } from '../../actions/index.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  file: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const store = useFileStore()
const { baseCtx, copyToClipboard } = useActionContext()

const anchorEl = ref(null)

// Is the right-clicked file part of the current multi-selection?
const isTarget = computed(() =>
  props.file != null &&
  store.selectedEntries.length > 1 &&
  store.selectedEntries.some(e => e.path === props.file.path)
)

const visibleItems = computed(() => {
  const ctx = {
    ...baseCtx.value,
    file: props.file,
    selection: store.selectedEntries,
    isMulti: store.selectedEntries.length > 1,
    isTarget: isTarget.value,
    copyToClipboard: () => copyToClipboard(props.file),
  }
  return resolveMenuActions(ctx)
})
</script>

<template>
  <!-- Zero-size anchor at the click position; Vuetify uses it for overflow-aware placement -->
  <div
    ref="anchorEl"
    :style="{ position: 'fixed', left: x + 'px', top: y + 'px', width: 0, height: 0, pointerEvents: 'none' }"
  />
  <v-menu
    :model-value="modelValue"
    :activator="anchorEl"
    location="bottom start"
    close-on-content-click
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-list density="compact" min-width="180">
      <template v-for="item in visibleItems" :key="item.key">
        <v-divider v-if="item.divider" />
        <v-list-item
          :prepend-icon="item.icon"
          :title="item.label"
          :base-color="item.color"
          @click="item.action()"
        />
      </template>
    </v-list>
  </v-menu>
</template>
