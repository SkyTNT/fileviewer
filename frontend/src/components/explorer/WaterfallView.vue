<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '../../stores/fileStore.js'
import FileCard from './FileCard.vue'

const emit = defineEmits(['open-file'])
const store = useFileStore()

const displayEntries = ref([])
const sentinelRef    = ref(null)
let observer = null

// When entries update: replace (page 1) or append (page 2+)
watch(() => store.entries, (newEntries) => {
  if (store.page === 1) {
    displayEntries.value = [...newEntries]
  } else {
    displayEntries.value = [...displayEntries.value, ...newEntries]
  }
}, { immediate: true })

function loadMore() {
  if (store.loading || displayEntries.value.length >= store.total) return
  store.goToPage(store.page + 1)
}

// Re-observe sentinel whenever it mounts/unmounts (v-if toggling)
watch(sentinelRef, (el, oldEl) => {
  if (oldEl) observer?.unobserve(oldEl)
  if (el)    observer?.observe(el)
})

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '400px' }
  )
  if (sentinelRef.value) observer.observe(sentinelRef.value)
})

onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="waterfall-container pa-3">
    <!-- Initial load -->
    <div v-if="store.loading && displayEntries.length === 0"
         class="d-flex justify-center align-center" style="height:200px">
      <v-progress-circular indeterminate />
    </div>

    <!-- Empty directory -->
    <div v-else-if="!store.loading && store.total === 0"
         class="text-center text-grey pa-12">
      <v-icon size="64" class="mb-2">mdi-folder-open-outline</v-icon>
      <div>Empty directory</div>
    </div>

    <!-- Content -->
    <template v-else>
      <div class="waterfall">
        <FileCard
          v-for="file in displayEntries"
          :key="file.path"
          :file="file"
          @open="emit('open-file', $event)"
          @navigate="store.navigate"
        />
      </div>

      <!-- Sentinel triggers loadMore when scrolled into view -->
      <div ref="sentinelRef" style="height:1px" />

      <!-- Loading next page -->
      <div v-if="store.loading" class="d-flex justify-center pa-4">
        <v-progress-circular indeterminate size="28" width="3" />
      </div>

      <!-- All loaded -->
      <div v-else-if="displayEntries.length >= store.total && store.total > 0"
           class="text-center text-caption text-medium-emphasis pa-3">
        — {{ store.total }} items —
      </div>
    </template>
  </div>
</template>

<style scoped>
.waterfall-container {
  height: 100%;
  overflow-y: auto;
}
.waterfall {
  columns: 5 160px;
  column-gap: 8px;
}
@media (max-width: 1200px) { .waterfall { columns: 4 140px; } }
@media (max-width: 900px)  { .waterfall { columns: 3 140px; } }
@media (max-width: 600px)  { .waterfall { columns: 2 140px; } }
</style>
