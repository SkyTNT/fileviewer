<script setup>
import { computed, ref } from 'vue'
import { resolveMenuActions } from '@/plugins/actions/index.js'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})
defineEmits(['update:modelValue'])

const anchorEl = ref(null)
const visibleItems = computed(() => resolveMenuActions())
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
