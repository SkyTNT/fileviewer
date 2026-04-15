<script setup>
import { useI18n } from 'vue-i18n'
import { useFileStore } from '../../stores/fileStore.js'

const store = useFileStore()
const { t } = useI18n()
</script>

<template>
  <v-dialog :model-value="!!store.nameConflicts" max-width="480" persistent>
    <v-card>
      <v-card-title class="pa-4">{{ t('notify.conflict') }}</v-card-title>
      <v-card-text class="pt-0">
        <p class="mb-3 text-body-2">
          {{ t('notify.alreadyExist', { n: store.nameConflicts?.conflicts.length }) }}
        </p>
        <v-list density="compact" class="rounded mb-3" max-height="160" style="overflow-y:auto">
          <v-list-item
            v-for="c in (store.nameConflicts?.conflicts ?? []).slice(0, 100)"
            :key="c.name"
            :title="c.name"
            prepend-icon="mdi-file-outline"
          />
          <v-list-item
            v-if="(store.nameConflicts?.conflicts.length ?? 0) > 100"
            :title="t('notify.andMore', { n: store.nameConflicts.conflicts.length - 100 })"
          />
        </v-list>
        <p class="text-body-2">{{ t('notify.whatToDo') }}</p>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0 flex-wrap ga-2">
        <v-btn variant="text" @click="store.cancelNameConflicts">{{ t('notify.cancel') }}</v-btn>
        <v-spacer />
        <v-btn variant="tonal" @click="store.resolveNameConflicts('skip')">{{ t('notify.skip') }}</v-btn>
        <v-btn variant="tonal" color="warning" @click="store.resolveNameConflicts('coexist')">{{ t('notify.keepBoth') }}</v-btn>
        <v-btn variant="tonal" color="error" @click="store.resolveNameConflicts('overwrite')">{{ t('notify.overwrite') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
