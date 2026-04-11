<script setup>
defineProps({
  modelValue: Boolean,
  title:      { type: String,  default: '' },
  label:      { type: String,  default: '' },
  name:       { type: String,  default: '' },
  loading:    { type: Boolean, default: false },
  error:      { type: String,  default: '' },
})
defineEmits(['update:modelValue', 'update:name', 'confirm'])
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="360"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">{{ title }}</v-card-title>
      <v-card-text class="pt-0">
        <v-text-field
          :model-value="name"
          :label="label"
          autofocus
          :error-messages="error"
          @update:model-value="$emit('update:name', $event)"
          @keydown.enter="$emit('confirm')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" :loading="loading" @click="$emit('confirm')">Create</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
