<script setup>
import { ref, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  file: { type: Object, required: true },
})

const services = inject('services')
const textApi  = services?.get('text.api')
const JsonNode = services?.get('text.json-node')
const { t }    = useI18n()

const metaData    = ref(null)
const metaLoading = ref(false)

watch(() => props.file, async (f) => {
  metaData.value = null
  if (!f?.meta_path) return
  metaLoading.value = true
  try {
    const res = await textApi.getContent(f.meta_path)
    metaData.value = JSON.parse(res.data.content)
  } catch {
    metaData.value = null
  } finally {
    metaLoading.value = false
  }
}, { immediate: true })
</script>

<template>
  <div class="px-3 pt-3 pb-1 d-flex align-center">
    <span class="text-caption text-medium-emphasis" style="text-transform:uppercase;letter-spacing:.05em;font-size:11px">{{ t('detail.meta') }}</span>
    <v-progress-circular v-if="metaLoading" indeterminate size="12" width="2" class="ml-2" />
  </div>
  <div v-if="metaData" class="px-3 pb-3 meta-tree">
    <JsonNode :value="metaData" :depth="0" />
  </div>
</template>

<style scoped>
.meta-tree { overflow-x: auto; }
</style>
