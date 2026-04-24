<script setup>
import { inject, ref } from 'vue'
import ColorPickerDialog from '../dialogs/ColorPickerDialog.vue'

const state = inject('editorState')
const showFg = ref(false)
const showBg = ref(false)

function swapColors() {
  const tmp = state.fgColor
  state.fgColor = state.bgColor
  state.bgColor = tmp
}

function resetColors() {
  state.fgColor = '#000000'
  state.bgColor = '#ffffff'
}
</script>

<template>
  <div class="color-widget">
    <!-- BG swatch (back) -->
    <v-menu v-model="showBg" :close-on-content-click="false" location="bottom end" :z-index="9999">
      <template #activator="{ props: menuProps }">
        <div class="swatch swatch-bg" :style="{ background: state.bgColor }" v-bind="menuProps" title="Background color" />
      </template>
      <v-card class="pa-2" elevation="8">
        <ColorPickerDialog v-model="state.bgColor" />
      </v-card>
    </v-menu>
    <!-- FG swatch (front) -->
    <v-menu v-model="showFg" :close-on-content-click="false" location="bottom end" :z-index="9999">
      <template #activator="{ props: menuProps }">
        <div class="swatch swatch-fg" :style="{ background: state.fgColor }" v-bind="menuProps" title="Foreground color" />
      </template>
      <v-card class="pa-2" elevation="8">
        <ColorPickerDialog v-model="state.fgColor" />
      </v-card>
    </v-menu>
    <!-- Control buttons -->
    <button class="ctrl-btn swap-btn" @click="swapColors" title="Swap colors (X)">⇄</button>
    <button class="ctrl-btn reset-btn" @click="resetColors" title="Reset to black/white (D)">⊡</button>
  </div>
</template>

<style scoped>
.color-widget {
  position: relative;
  width: 44px;
  height: 44px;
  margin: 4px auto;
}
.swatch {
  position: absolute;
  width: 28px; height: 28px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 3px;
  cursor: pointer;
}
.swatch-bg { bottom: 0; right: 0; }
.swatch-fg { top: 0; left: 0; z-index: 1; }
.ctrl-btn {
  position: absolute;
  background: rgba(0,0,0,0.6);
  border: none;
  color: #ccc;
  font-size: 10px;
  width: 14px; height: 14px;
  cursor: pointer;
  padding: 0;
  border-radius: 2px;
  line-height: 1;
}
.swap-btn { top: 0; right: 0; }
.reset-btn { bottom: 0; left: 0; }
</style>
