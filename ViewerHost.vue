<template>
  <component
    v-for="desc in registry.descriptors"
    :key="desc.key"
    :is="desc.component"
    :ref="(el) => desc._ref.value = el"
  />
</template>

<script setup>
import { inject } from 'vue'
const services = inject('services')
const registry = services.get('app.registry')
</script>
