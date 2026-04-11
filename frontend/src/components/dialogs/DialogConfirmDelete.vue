<script setup>
defineProps({
  modelValue: Boolean,
  targets:    { type: Array, default: () => [] },
})
defineEmits(['update:modelValue', 'confirm'])
</script>

<template>
  <v-dialog :model-value="modelValue" :max-width="targets.length === 1 ? 360 : 400"
            @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pa-4">
        Delete{{ targets.length > 1 ? ` ${targets.length} items` : '' }}
      </v-card-title>
      <v-card-text class="pt-0">
        <template v-if="targets.length === 1">
          Are you sure you want to delete <strong>{{ targets[0]?.name }}</strong>?
          <span v-if="targets[0]?.is_dir" class="text-error d-block mt-1 text-body-2">
            This will delete the folder and all its contents.
          </span>
        </template>
        <template v-else>
          Are you sure you want to delete {{ targets.length }} items? This cannot be undone.
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="error" @click="$emit('confirm')">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
