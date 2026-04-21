<template>
  <v-app>
    <SlotHost name="app.login" />
    <SlotHost name="sidebar.top" />
    <SlotHost name="toolbar" />
    <SlotHost name="content.layout" />
    <SlotHost name="windows" />
    <SlotHost name="taskbar" />
    <SlotHost name="task.panel" />
    <SlotHost name="notifications" />
  </v-app>
</template>

<script setup>
import SlotHost from './SlotHost.vue'
</script>
