<script setup>
defineProps({
  modelValue: Boolean,
  count:      { type: Number, default: 0 },
})
defineEmits(['update:modelValue', 'confirm'])
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="400"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">Delete {{ count }} items</v-card-title>
      <v-card-text class="pt-0">
        Are you sure you want to delete {{ count }} items? This cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="error" @click="$emit('confirm')">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
