<script setup>
import { ref, computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import { Codemirror } from 'vue-codemirror'
import { basicSetup } from 'codemirror'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { php } from '@codemirror/lang-php'
import { vue } from '@codemirror/lang-vue'
import { textApi, writeApi } from '../../services/api.js'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { useFileStore } from '../../stores/fileStore.js'

const props = defineProps({ file: { type: Object, default: null } })
const emit  = defineEmits(['error', 'open-hex'])

const store = useFileStore()
const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

const dialog      = ref(false)
const content     = ref('')
const editText    = ref('')
const loading     = ref(false)
const saving      = ref(false)
const error       = ref(null)
const saveError   = ref(null)
const truncated   = ref(false)
const editMode    = ref(false)
const currentFile = ref(null)
const lineCount   = ref(0)

const isDirty     = computed(() => editMode.value && editText.value !== content.value)
const isMarkdown  = computed(() => ['.md', '.markdown'].includes((currentFile.value?.extension || '').toLowerCase()))
const previewMode = ref(false)

// ── Language detection ────────────────────────────────────────────────────────
function getLang(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.js': case '.jsx': case '.mjs': case '.cjs':
      return javascript({ jsx: true })
    case '.ts': return javascript({ typescript: true })
    case '.tsx': return javascript({ typescript: true, jsx: true })
    case '.py': return python()
    case '.html': case '.htm': return html()
    case '.css': return css()
    case '.json': case '.jsonl': return json()
    case '.sql': return sql()
    case '.xml': return xml()
    case '.svg': return xml()
    case '.md': case '.rst': return markdown()
    case '.yaml': case '.yml': return yaml()
    case '.c': case '.h': case '.cpp': case '.hpp': case '.cc': case '.cxx': return cpp()
    case '.java': case '.kt': case '.kts': return java()
    case '.rs': return rust()
    case '.php': return php()
    case '.vue': return vue()
    default: return null
  }
}

// ── CodeMirror extensions ─────────────────────────────────────────────────────
const fillTheme = EditorView.theme({
  '.cm-scroller':{ fontFamily: "'Roboto Mono','Courier New',monospace", fontSize: '13px', lineHeight: '1.5' },
  '.cm-content': { paddingBottom: '16px' },
  '.cm-gutters': { fontFamily: "'Roboto Mono','Courier New',monospace", fontSize: '13px', minHeight: '100%' },
})

const extensions = computed(() => {
  const exts = [basicSetup, fillTheme, EditorView.lineWrapping]
  if (isDark.value) exts.push(oneDark)
  if (!editMode.value) exts.push(EditorState.readOnly.of(true))
  const lang = getLang(currentFile.value?.extension)
  if (lang) exts.push(lang)
  return exts
})

// ── File open / close ─────────────────────────────────────────────────────────
async function open(file) {
  currentFile.value = file
  dialog.value    = true
  loading.value   = true
  error.value     = null
  saveError.value = null
  content.value   = ''
  editText.value  = ''
  truncated.value = false
  editMode.value   = false
  previewMode.value = false
  lineCount.value  = 0
  try {
    const res = await textApi.getContent(file.path)
    content.value  = res.data.content
    editText.value = res.data.content
    truncated.value = res.data.truncated
    lineCount.value = res.data.content.split('\n').length
  } catch (e) {
    if (e.response?.status === 415) {
      dialog.value = false
      emit('open-hex', file)
    } else {
      error.value = e.response?.data?.detail || e.message
    }
  } finally {
    loading.value = false
  }
}

function close() {
  if (isDirty.value && !confirm('You have unsaved changes. Close anyway?')) return
  dialog.value   = false
  editMode.value = false
}

function toggleEdit() {
  if (editMode.value && isDirty.value) {
    if (!confirm('Discard unsaved changes?')) return
    editText.value = content.value
  }
  editMode.value = !editMode.value
  if (!editMode.value) saveError.value = null
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  if (!isDirty.value) return
  saving.value    = true
  saveError.value = null
  try {
    await writeApi.save(currentFile.value.path, editText.value)
    content.value   = editText.value
    lineCount.value = editText.value.split('\n').length
    store.loadDirectory(store.currentPath)
  } catch (e) {
    saveError.value = e.response?.data?.detail || e.message
  } finally {
    saving.value = false
  }
}

// update line count while editing
watch(editText, (v) => {
  if (editMode.value) lineCount.value = v.split('\n').length
})

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (editMode.value) save()
  }
}

watch(isDirty, (dirty) => {
  window.onbeforeunload = dirty ? () => '' : null
})

defineExpose({ open })
</script>

<template>
  <v-dialog v-model="dialog" max-width="1100" @keydown="onKeydown">
    <v-card style="display:flex; flex-direction:column; height:88vh">

      <!-- Title bar -->
      <v-card-title class="d-flex align-center pa-3 flex-shrink-0" style="gap:6px">
        <v-icon size="20">mdi-file-document-outline</v-icon>
        <span class="text-truncate" style="max-width:55%; font-size:14px">{{ currentFile?.name }}</span>
        <span v-if="isDirty" class="text-warning" style="font-size:18px; line-height:1" title="Unsaved changes">●</span>

        <v-chip v-if="currentFile?.extension" size="x-small" variant="tonal" color="secondary" label>
          {{ currentFile.extension.slice(1).toUpperCase() }}
        </v-chip>
        <v-spacer />

        <!-- Markdown preview toggle -->
        <v-btn
          v-if="isMarkdown && !loading && !error"
          size="small"
          :variant="previewMode ? 'tonal' : 'text'"
          :color="previewMode ? 'primary' : undefined"
          prepend-icon="mdi-language-markdown-outline"
          @click="previewMode = !previewMode"
        >{{ previewMode ? 'Source' : 'Preview' }}</v-btn>

        <!-- Write-mode controls -->
        <template v-if="store.writeMode && !loading && !error && !truncated && !previewMode">
          <v-btn
            size="small"
            :variant="editMode ? 'tonal' : 'text'"
            :color="editMode ? 'primary' : undefined"
            :prepend-icon="editMode ? 'mdi-eye-outline' : 'mdi-pencil-outline'"
            @click="toggleEdit"
          >{{ editMode ? 'View' : 'Edit' }}</v-btn>

          <v-btn
            v-if="editMode"
            size="small"
            color="success"
            variant="tonal"
            prepend-icon="mdi-content-save-outline"
            :loading="saving"
            :disabled="!isDirty"
            @click="save"
          >Save</v-btn>
        </template>

        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <!-- Body: outer div scrolls, CodeMirror grows to natural height -->
      <div class="flex-grow-1 editor-body">

        <div v-if="loading" class="d-flex justify-center pa-8">
          <v-progress-circular indeterminate />
        </div>

        <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>

        <template v-else>
          <v-alert v-if="truncated" type="warning" density="compact" class="ma-2">
            File truncated at 5 MB — editing disabled
          </v-alert>
          <v-alert
            v-if="saveError"
            type="error"
            density="compact"
            closable
            class="ma-2"
            @click:close="saveError = null"
          >{{ saveError }}</v-alert>

          <!-- Markdown preview -->
          <MarkdownRenderer
            v-if="previewMode"
            :content="editText"
            :isDark="isDark"
          />

          <!-- CodeMirror editor -->
          <Codemirror
            v-else
            :key="currentFile?.path"
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
          <span>{{ lineCount }} lines</span>
          <span v-if="currentFile?.size != null">
            {{ currentFile.size < 1048576
              ? (currentFile.size / 1024).toFixed(1) + ' KB'
              : (currentFile.size / 1048576).toFixed(1) + ' MB' }}
          </span>
          <span v-if="editMode">
            <v-icon size="12" class="mr-1">mdi-keyboard-outline</v-icon>Ctrl+S to save
          </span>
          <v-spacer />
          <span v-if="editMode && isDirty" class="text-warning">Unsaved</span>
          <span v-else-if="editMode" class="text-success">Saved</span>
          <span v-if="currentFile?.extension">
            {{ { '.js':'JavaScript', '.mjs':'JavaScript', '.cjs':'JavaScript',
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
                 '.go':'Go', '.rb':'Ruby', '.sh':'Shell', '.bash':'Bash',
                 '.cs':'C#', '.swift':'Swift', '.dart':'Dart',
                 '.lua':'Lua', '.pl':'Perl', '.r':'R',
               }[currentFile.extension.toLowerCase()] || 'Plain Text' }}
          </span>
        </div>
      </template>

    </v-card>
  </v-dialog>
</template>

<style scoped>
.editor-body {
  overflow-y: auto;
  min-height: 0;
}
:deep(.cm-editor) {
  width: 100%;
}
</style>
