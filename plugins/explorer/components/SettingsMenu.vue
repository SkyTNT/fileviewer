<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const services     = inject('services')
const themeService = services.get('theme.service')
const authState    = services.get('auth.state')
const { isDark, accentColor, ACCENT_COLORS, toggleMode, setAccent } = themeService.useAppTheme()
const { t, locale } = useI18n()
const { mobile }    = useDisplay()

function setLocale(lang) {
  locale.value = lang
  localStorage.setItem('fv-locale', lang)
}
</script>

<template>
  <template v-if="!mobile">
  <!-- Dark / Light toggle -->
  <v-btn icon size="small" class="mr-1" @click="toggleMode">
    <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    <v-tooltip activator="parent">{{ isDark ? t('toolbar.lightMode') : t('toolbar.darkMode') }}</v-tooltip>
  </v-btn>

  <!-- Settings menu (language + accent + logout) -->
  <v-menu :close-on-content-click="false" location="bottom end">
    <template #activator="{ props }">
      <v-btn icon size="small" v-bind="props">
        <v-icon size="20">mdi-cog-outline</v-icon>
        <v-tooltip activator="parent">{{ t('toolbar.settings') }}</v-tooltip>
      </v-btn>
    </template>
    <v-card min-width="200" class="pa-1">
      <!-- Language -->
      <v-list-item prepend-icon="mdi-translate" :title="t('toolbar.language')" density="compact" rounded="lg">
        <template #append>
          <div class="d-flex ga-1">
            <v-btn v-for="[code, label] in [['en','EN'],['zh-CN','简体'],['zh-TW','繁中'],['ja','日本語']]"
              :key="code" size="x-small"
              :variant="locale === code ? 'tonal' : 'text'"
              :color="locale === code ? 'primary' : undefined"
              @click.stop="setLocale(code)"
            >{{ label }}</v-btn>
          </div>
        </template>
      </v-list-item>

      <!-- Accent color -->
      <v-list-item density="compact" class="pa-2">
        <div class="text-caption text-medium-emphasis mb-1 ml-1">{{ t('toolbar.accentColor') }}</div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn v-for="c in ACCENT_COLORS" :key="c.value" icon size="28"
            :style="{ backgroundColor: c.value }"
            :elevation="accentColor === c.value ? 4 : 0"
            @click="setAccent(c.value)"
          >
            <v-icon v-if="accentColor === c.value" size="16" color="white">mdi-check</v-icon>
            <v-tooltip activator="parent">{{ c.label }}</v-tooltip>
          </v-btn>
        </div>
      </v-list-item>

      <!-- Logout -->
      <template v-if="authState?.authRequired">
        <v-divider />
        <v-list-item prepend-icon="mdi-logout" :title="t('toolbar.logout')"
          density="compact" rounded="lg" base-color="error"
          @click="authState.logout"
        />
      </template>
    </v-card>
  </v-menu>
  </template>
</template>
