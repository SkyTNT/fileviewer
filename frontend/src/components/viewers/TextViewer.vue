<script setup>
import { ref, watch } from 'vue'
import { textApi } from '../../services/api.js'

const props = defineProps({
  file: { type: Object, default: null },
})
const emit = defineEmits(['error'])

const dialog = ref(false)
const content = ref('')
const loading = ref(false)
const error = ref(null)
const truncated = ref(false)

async function open(file) {
  dialog.value = true
  loading.value = true
  error.value = null
  content.value = ''
  truncated.value = false
  try {
    const res = await textApi.getContent(file.path)
    content.value = res.data.content
    truncated.value = res.data.truncated
  } catch (e) {
    if (e.response?.status === 415) {
      dialog.value = false
      emit('error', e.response.data.detail)
    } else {
      error.value = e.response?.data?.detail || e.message
    }
  } finally {
    loading.value = false
  }
}

function close() {
  dialog.value = false
  content.value = ''
}

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" max-width="1000" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-file-document</v-icon>
        {{ file?.name }}
        <v-spacer />
        <v-btn icon size="small" @click="close"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-0" style="max-height:80vh">
        <div v-if="loading" class="d-flex justify-center pa-8">
          <v-progress-circular indeterminate />
        </div>
        <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>
        <template v-else>
          <v-alert v-if="truncated" type="warning" density="compact" class="ma-2">
            File truncated at 5MB
          </v-alert>
          <pre class="text-content pa-4">{{ content }}</pre>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.text-content {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
}
</style>
