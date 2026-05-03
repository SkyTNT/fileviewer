<template>
  <div v-if="bookmarks.items.length > 0" class="bookmarks-panel">
    <v-divider />
    <div class="bookmarks-header px-3 py-1">
      <v-icon size="13" class="mr-1" style="opacity:0.6">mdi-bookmark-outline</v-icon>
      <span style="font-size:11px; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em">
        {{ t('bookmarks.title') }}
      </span>
    </div>
    <v-list density="compact" nav class="pa-1 pt-0">
      <v-list-item
        v-for="item in bookmarks.items"
        :key="item.path"
        :active="explorer.currentPath === item.path"
        color="primary"
        rounded="lg"
        prepend-icon="mdi-folder-outline"
        :title="item.name"
        class="bookmark-item"
        @click="explorer.navigate(item.path)"
      >
        <template #append>
          <v-btn
            icon
            size="x-small"
            variant="text"
            class="bookmark-remove"
            @click.stop="bookmarks.remove(item.path)"
          >
            <v-icon size="14">mdi-close</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'

const services = inject('services')
const { t } = useI18n()

const bookmarks = services.get('bookmarks.state')
const explorer  = services.get('explorer.state')
</script>

<style scoped>
.bookmarks-header {
  display: flex;
  align-items: center;
}
.bookmark-remove {
  opacity: 0;
  transition: opacity 0.15s;
}
.bookmark-item:hover .bookmark-remove {
  opacity: 1;
}
</style>
