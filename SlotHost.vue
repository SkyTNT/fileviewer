<template>
  <component
    :is="entry.component"
    v-for="entry in entries"
    :key="entry.key"
    v-bind="entry.props"
  />
</template>

<script setup>
import { computed, inject } from 'vue'

const props = defineProps({ name: { type: String, required: true } })
const slotHost = inject('slot.host')
const entries = computed(() => slotHost?.get(props.name) ?? [])
</script>
