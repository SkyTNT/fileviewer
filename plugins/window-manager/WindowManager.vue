<template>
  <template v-for="win in manager.windows" :key="win.id">
    <Teleport to="body">
    <AppWindow
      :win="win"
      @focus="manager.focus(win.id)"
      @close="manager.close(win.id)"
      @minimize="manager.minimize(win.id)"
      @maximize="manager.maximize(win.id)"
      @update:position="p => manager.setPosition(win.id, p)"
      @update:size="s => manager.setSize(win.id, s)"
    >
      <component
        :is="win.component"
        v-bind="win.props"
        :win-id="win.id"
        :win-manager="manager"
      />
    </AppWindow>
    </Teleport>
  </template>
</template>

<script setup>
import AppWindow from './Window.vue'

defineProps({
  manager: { type: Object, required: true },
})
</script>

