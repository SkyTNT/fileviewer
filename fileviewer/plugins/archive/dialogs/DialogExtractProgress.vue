<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  onConfirm:  { type: Function, required: true },
  onCancel:   { type: Function, required: true },
  winId:      { type: String,   default: null },
  winManager: { type: Object,   default: null },
})

const { t }    = useI18n()
const password = ref('')
const showPwd  = ref(false)

function confirm() {
  props.winManager?.close(props.winId)
  props.onConfirm(password.value)
}

function cancel() {
  props.winManager?.close(props.winId)
  props.onCancel()
}
</script>

<template>
  <div class="pa-4 d-flex flex-column" style="height:100%">
    <div class="d-flex align-center mb-3 ga-2">
      <v-icon color="warning">mdi-lock-outline</v-icon>
      <span class="text-subtitle-1 font-weight-medium">{{ t('archive.app.passwordPrompt') }}</span>
    </div>
    <v-text-field
      v-model="password"
      :type="showPwd ? 'text' : 'password'"
      :label="t('archive.app.password')"
      autocomplete="off"
      density="compact"
      variant="outlined"
      hide-details
      class="mb-4"
      autofocus
      :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
      @click:append-inner="showPwd = !showPwd"
      @keydown.enter="confirm"
      @keydown.esc="cancel"
    />
    <div class="d-flex justify-end ga-2 mt-auto">
      <v-btn variant="text" @click="cancel">{{ t('dialog.cancel') }}</v-btn>
      <v-btn color="primary" @click="confirm">{{ t('archive.app.extract') }}</v-btn>
    </div>
  </div>
</template>
