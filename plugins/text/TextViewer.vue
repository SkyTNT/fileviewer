<script setup>
import { ref, computed, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { Codemirror } from 'vue-codemirror'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { completeAnyWord, acceptCompletion } from '@codemirror/autocomplete'
import { getLangByExt } from './codeMirrorLangs.js'
import MarkdownRenderer from './MarkdownRenderer.vue'

const wordCompletion = EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }])

const props = defineProps({
  file:       { type: Object, required: true },
  appOpts: { type: Object, default: () => ({}) },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const services       = inject('services')
const store          = services?.get('explorer.state')
const textApi        = services?.get('text.api')
const writeApi       = services?.get('write.api')
const { t }          = useI18n()
const vuetifyTheme   = useTheme()
const isDark         = computed(() => vuetifyTheme.global.current.value.dark)

const content     = ref('')
const editText    = ref('')
const loading     = ref(false)
const saving      = ref(false)
const error       = ref(null)
const saveError   = ref(null)
const truncated   = ref(false)
const editMode    = ref(false)
const lineCount   = ref(0)
const previewMode = ref(false)

const isDirty    = computed(() => editMode.value && editText.value !== content.value)
const isMarkdown = computed(() => ['.md', '.markdown'].includes((props.file?.extension || '').toLowerCase()))

// ── CodeMirror extensions ─────────────────────────────────────────────────────
const fillTheme = EditorView.theme({
  '&':           { height: '100%' },
  '.cm-scroller':{ fontFamily: "'Roboto Mono','Courier New',monospace", fontSize: '13px', lineHeight: '1.5', overflow: 'auto' },
  '.cm-content': { paddingBottom: '16px' },
  '.cm-gutters': { fontFamily: "'Roboto Mono','Courier New',monospace", fontSize: '13px', minHeight: '100%' },
})

const tabAccept = Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }]))

const extensions = computed(() => {
  const exts = [basicSetup, fillTheme, EditorView.lineWrapping, wordCompletion, tabAccept]
  if (isDark.value) exts.push(oneDark)
  if (!editMode.value) exts.push(EditorView.editable.of(false))
  const lang = getLangByExt(props.file?.extension)
  if (lang) exts.push(lang)
  return exts
})

watch(() => props.file, async (f) => {
  if (!f) return
  loading.value   = true
  error.value     = null
  saveError.value = null
  content.value   = ''
  editText.value  = ''
  truncated.value = false
  editMode.value  = false
  previewMode.value = false
  lineCount.value = 0
  try {
    const res = await textApi.getContent(f.path)
    content.value  = res.data.content
    editText.value = res.data.content
    truncated.value = res.data.truncated
    lineCount.value = res.data.content.split('\n').length
  } catch (e) {
    error.value = e.response?.data?.detail || e.message
  } finally {
    loading.value = false
  }
}, { immediate: true })

function toggleEdit() {
  if (editMode.value && isDirty.value) {
    if (!confirm(t('textApp.confirmDiscard'))) return
    editText.value = content.value
  }
  editMode.value = !editMode.value
  if (!editMode.value) saveError.value = null
}

async function save() {
  if (!isDirty.value) return
  saving.value    = true
  saveError.value = null
  try {
    await writeApi.save(props.file.path, editText.value)
    content.value   = editText.value
    lineCount.value = editText.value.split('\n').length
    store?.loadDirectory(store.currentPath)
  } catch (e) {
    saveError.value = e.response?.data?.detail || e.message
  } finally {
    saving.value = false
  }
}

watch(editText, (v) => { if (editMode.value) lineCount.value = v.split('\n').length })

watch(isDirty, (dirty) => { window.onbeforeunload = dirty ? () => '' : null })

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (editMode.value) save()
  }
}

const LANG_MAP = {
  '.js':'JavaScript', '.mjs':'JavaScript', '.cjs':'JavaScript',
  '.jsx':'JSX', '.ts':'TypeScript', '.tsx':'TSX',
  '.py':'Python', '.html':'HTML', '.htm':'HTML', '.css':'CSS',
  '.json':'JSON', '.jsonl':'JSONL', '.sql':'SQL',
  '.xml':'XML', '.svg':'SVG',
  '.md':'Markdown', '.rst':'reStructuredText',
  '.yaml':'YAML', '.yml':'YAML',
  '.c':'C', '.h':'C/C++ Header', '.cpp':'C++', '.hpp':'C++ Header',
  '.cc':'C++', '.cxx':'C++',
  '.java':'Java', '.kt':'Kotlin', '.kts':'Kotlin',
  '.rs':'Rust', '.php':'PHP', '.vue':'Vue',
  '.go':'Go', '.rb':'Ruby', '.sh':'Shell', '.bash':'Shell',
  '.cs':'C#', '.swift':'Swift', '.dart':'Dart',
  '.lua':'Lua', '.pl':'Perl', '.r':'R',
}
</script>

<template>
  <div class="text-app" @keydown="onKeydown">
    <!-- Toolbar -->
    <div class="text-toolbar d-flex align-center px-3 flex-shrink-0" style="gap:6px; height:44px">
      <span v-if="isDirty" class="text-warning" style="font-size:18px; line-height:1" :title="t('textApp.unsavedChanges')">●</span>
      <v-chip v-if="props.file?.extension" size="x-small" variant="tonal" color="secondary" label>
        {{ props.file.extension.slice(1).toUpperCase() }}
      </v-chip>
      <v-spacer />

      <v-btn
        v-if="isMarkdown && !loading && !error"
        size="small"
        :variant="previewMode ? 'tonal' : 'text'"
        :color="previewMode ? 'primary' : undefined"
        prepend-icon="mdi-language-markdown-outline"
        @click="previewMode = !previewMode"
      >{{ previewMode ? t('textApp.source') : t('textApp.preview') }}</v-btn>

      <template v-if="store?.writeMode && !loading && !error && !truncated && !previewMode">
        <v-btn
          size="small"
          :variant="editMode ? 'tonal' : 'text'"
          :color="editMode ? 'primary' : undefined"
          :prepend-icon="editMode ? 'mdi-eye-outline' : 'mdi-pencil-outline'"
          @click="toggleEdit"
        >{{ editMode ? t('textApp.view') : t('textApp.edit') }}</v-btn>

        <v-btn
          v-if="editMode"
          size="small" color="success" variant="tonal"
          prepend-icon="mdi-content-save-outline"
          :loading="saving" :disabled="!isDirty"
          @click="save"
        >{{ t('textApp.save') }}</v-btn>
      </template>
    </div>

    <v-divider />

    <!-- Body -->
    <div class="flex-grow-1 editor-body">
      <div v-if="loading" class="d-flex justify-center pa-8">
        <v-progress-circular indeterminate />
      </div>
      <div v-else-if="error" class="d-flex flex-column align-center justify-center pa-8 text-medium-emphasis" style="height:100%">
        <v-icon size="40" class="mb-3">mdi-alert-circle-outline</v-icon>
        <span class="text-body-2">{{ error }}</span>
      </div>
      <template v-else>
        <v-alert v-if="truncated" type="warning" density="compact" class="ma-2">
          {{ t('textApp.truncatedWarning') }}
        </v-alert>
        <v-alert v-if="saveError" type="error" density="compact" closable class="ma-2" @click:close="saveError = null">
          {{ saveError }}
        </v-alert>
        <div v-if="previewMode" class="md-preview-scroll">
          <MarkdownRenderer :content="editText" :isDark="isDark" />
        </div>
        <Codemirror
          v-else
          :key="props.file?.path"
          v-model="editText"
          :extensions="extensions"
        />
      </template>
    </div>

    <!-- Status bar -->
    <template v-if="!loading && !error">
      <v-divider />
      <div class="d-flex align-center px-3 text-caption text-medium-emphasis"
           style="height:26px; font-family:'Roboto Mono',monospace; font-size:11px; gap:16px">
        <span>{{ t('textApp.lines', { n: lineCount }) }}</span>
        <span v-if="props.file?.size != null">
          {{ props.file.size < 1048576
            ? (props.file.size / 1024).toFixed(1) + ' KB'
            : (props.file.size / 1048576).toFixed(1) + ' MB' }}
        </span>
        <span v-if="editMode">
          <v-icon size="12" class="mr-1">mdi-keyboard-outline</v-icon>{{ t('textApp.ctrlSToSave') }}
        </span>
        <v-spacer />
        <span v-if="editMode && isDirty" class="text-warning">{{ t('textApp.unsaved') }}</span>
        <span v-else-if="editMode" class="text-success">{{ t('textApp.saved') }}</span>
        <span v-if="props.file?.extension">{{ LANG_MAP[props.file.extension.toLowerCase()] || 'Plain Text' }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.text-toolbar {
  border-bottom: none;
  flex-shrink: 0;
}
.editor-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}
.md-preview-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
:deep(.vue-codemirror) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
:deep(.cm-editor) {
  width: 100%;
  height: 100%;
}
</style>
