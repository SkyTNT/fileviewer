<script setup>
import { ref, inject, onMounted, onUnmounted } from 'vue'

const events = inject('events')

const msg     = ref('')
const color   = ref('error')
const visible = ref(false)

function onShow({ msg: m, color: c = 'error' }) {
  msg.value     = m
  color.value   = c
  visible.value = true
}

onMounted(() => events?.on('notification:show', onShow, 'notification'))
onUnmounted(() => events?.off('notification:show', onShow))
</script>

<template>
  <v-snackbar v-model="visible" :color="color" timeout="3000" location="bottom">
    <v-icon class="mr-2">{{ color === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
    {{ msg }}
  </v-snackbar>
</template>
