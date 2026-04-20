<script setup>
import { computed, ref, inject } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})
defineEmits(['update:modelValue'])

const services = inject('services')
const store = inject('services').get('explorer.state')
const anchorEl = ref(null)
const visibleItems = computed(() => {
  const registry = services?.get('action.registry')
  return registry ? registry.resolveMenu() : []
})
</script>

<template>
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
      <template v-for="item in visibleItems" :key="item.id">
        <v-divider v-if="item.divider" />
        <v-list-item
          :prepend-icon="item.icon"
          :title="item.label()"
          :base-color="item.color"
          @click="item.execute()"
        />
      </template>
    </v-list>
  </v-menu>
</template>
