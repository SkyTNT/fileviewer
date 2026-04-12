<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  total:      { type: Number, required: true },
  disabled:   { type: Boolean, default: false },
  variant:    { type: String,  default: 'text' },
})

const emit = defineEmits(['navigate'])

const pageInput = ref(props.modelValue)
watch(() => props.modelValue, v => { pageInput.value = v })

function go(p) {
  const clamped = Math.max(1, Math.min(p, props.total))
  if (clamped !== props.modelValue) emit('navigate', clamped)
}

function onInputCommit() {
  const val = parseInt(pageInput.value)
  if (!isNaN(val)) go(val)
  else pageInput.value = props.modelValue
}
</script>

<template>
  <div class="d-flex align-center ga-2">
    <v-btn icon size="small" :variant="variant" :disabled="disabled || modelValue <= 1" @click="go(1)">
      <v-icon>mdi-page-first</v-icon>
    </v-btn>
    <v-btn icon size="small" :variant="variant" :disabled="disabled || modelValue <= 1" @click="go(modelValue - 1)">
      <v-icon>mdi-chevron-left</v-icon>
    </v-btn>
    <input
      v-model.number="pageInput"
      class="page-input"
      type="number"
      min="1"
      :max="total"
      @keydown.enter.prevent="onInputCommit"
      @blur="onInputCommit"
    />
    <span class="text-body-2">/ {{ total }}</span>
    <v-btn icon size="small" :variant="variant" :disabled="disabled || modelValue >= total" @click="go(modelValue + 1)">
      <v-icon>mdi-chevron-right</v-icon>
    </v-btn>
    <v-btn icon size="small" :variant="variant" :disabled="disabled || modelValue >= total" @click="go(total)">
      <v-icon>mdi-page-last</v-icon>
    </v-btn>
    <slot />
  </div>
</template>

<style scoped>
.page-input {
  width: 52px;
  text-align: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 3px 4px;
  font-size: 13px;
  background: transparent;
  color: inherit;
  outline: none;
}
.page-input:focus {
  border-color: rgb(var(--v-theme-primary));
  border-width: 2px;
}
.page-input::-webkit-inner-spin-button,
.page-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.page-input[type=number] { -moz-appearance: textfield; }
</style>
