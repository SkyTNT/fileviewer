<script setup>
import { computed, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Codemirror } from 'vue-codemirror'
import { basicSetup } from 'codemirror'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { getLangByName } from '@/utils/codeMirrorLangs.js'

const props = defineProps({
  content: { type: String, default: '' },
  isDark:  { type: Boolean, default: false },
})

// Per-block copy state: index → 'idle' | 'copied'
const copyState = ref({})

async function copyCode(text, i) {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = { ...copyState.value, [i]: 'copied' }
    setTimeout(() => {
      copyState.value = { ...copyState.value, [i]: 'idle' }
    }, 2000)
  } catch {
    // fallback: execCommand
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    copyState.value = { ...copyState.value, [i]: 'copied' }
    setTimeout(() => {
      copyState.value = { ...copyState.value, [i]: 'idle' }
    }, 2000)
  }
}

// Split markdown into top-level tokens
const tokens = computed(() =>
  marked.lexer(props.content || '').filter(t => t.type !== 'space')
)

// Shared theme override for code-block CodeMirror instances
const codeTheme = EditorView.theme({
  '.cm-scroller': {
    fontFamily: "'Roboto Mono','Courier New',monospace",
    fontSize: '13px',
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    fontFamily: "'Roboto Mono','Courier New',monospace",
    fontSize: '13px',
  },
  '.cm-content': { paddingBottom: '8px' },
})

function getCodeExtensions(lang) {
  const exts = [
    basicSetup,
    codeTheme,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
  ]
  if (props.isDark) exts.push(oneDark)
  const langExt = getLangByName(lang)
  if (langExt) exts.push(langExt)
  return exts
}

// Render a single non-code token to sanitised HTML
function renderToken(token) {
  try {
    return DOMPurify.sanitize(marked.parser([token]))
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="md-body">
    <template v-for="(token, i) in tokens" :key="i">

      <!-- Fenced code block → CodeMirror (line numbers + syntax highlight) -->
      <div v-if="token.type === 'code'" class="md-code-wrap">
        <div class="md-code-header">
          <span class="md-code-lang">{{ token.lang || 'text' }}</span>
          <v-btn
            size="x-small"
            variant="text"
            :color="copyState[i] === 'copied' ? 'success' : undefined"
            :prepend-icon="copyState[i] === 'copied' ? 'mdi-check' : 'mdi-content-copy'"
            class="md-copy-btn"
            @click="copyCode(token.text, i)"
          >{{ copyState[i] === 'copied' ? 'Copied' : 'Copy' }}</v-btn>
        </div>
        <Codemirror
          :model-value="token.text"
          :extensions="getCodeExtensions(token.lang)"
          class="md-codemirror"
        />
      </div>

      <!-- Everything else → marked HTML -->
      <div v-else class="md-token" v-html="renderToken(token)" />

    </template>
  </div>
</template>

<style scoped>
.md-body {
  padding: 24px 32px;
  max-width: 860px;
  margin: 0 auto;
  font-size: 15px;
  line-height: 1.7;
}

/* ── Code block wrapper ───────────────────────────────────────────────────── */
.md-code-wrap {
  margin: 1em 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(128, 128, 128, 0.15);
}
.md-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 2px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);
}
.md-code-lang {
  font-family: 'Roboto Mono', monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.55;
}
.md-codemirror {
  display: block;
}
/* Remove CodeMirror's own border/outline inside card */
:deep(.md-codemirror .cm-editor) {
  outline: none;
}

/* ── Prose styles (applied via :deep on .md-token children) ──────────────── */
:deep(.md-token h1),
:deep(.md-token h2),
:deep(.md-token h3),
:deep(.md-token h4),
:deep(.md-token h5),
:deep(.md-token h6) {
  margin: 1.3em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
}
:deep(.md-token h1) { font-size: 2em;   border-bottom: 1px solid rgba(128,128,128,.2); padding-bottom: .25em; }
:deep(.md-token h2) { font-size: 1.5em; border-bottom: 1px solid rgba(128,128,128,.12); padding-bottom: .2em; }
:deep(.md-token h3) { font-size: 1.25em; }
:deep(.md-token p)  { margin: 0.75em 0; }
:deep(.md-token a)  { color: rgb(var(--v-theme-primary)); text-decoration: none; }
:deep(.md-token a:hover) { text-decoration: underline; }
:deep(.md-token code) {
  font-family: 'Roboto Mono', monospace;
  font-size: .875em;
  background: rgba(128,128,128,.12);
  border-radius: 4px;
  padding: .15em .4em;
}
:deep(.md-token pre) {
  background: rgba(128,128,128,.1);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin: 1em 0;
}
:deep(.md-token pre code) { background: none; padding: 0; font-size: 13px; }
:deep(.md-token blockquote) {
  margin: 1em 0;
  padding: .5em 1em;
  border-left: 4px solid rgba(var(--v-theme-primary), .5);
  color: rgba(var(--v-theme-on-surface), .65);
  background: rgba(128,128,128,.06);
  border-radius: 0 4px 4px 0;
}
:deep(.md-token ul),
:deep(.md-token ol)  { padding-left: 2em; margin: .5em 0; }
:deep(.md-token li)  { margin: .25em 0; }
:deep(.md-token hr)  { border: none; border-top: 1px solid rgba(128,128,128,.2); margin: 1.5em 0; }
:deep(.md-token table) { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 14px; }
:deep(.md-token th),
:deep(.md-token td)  { border: 1px solid rgba(128,128,128,.2); padding: 6px 12px; }
:deep(.md-token th)  { background: rgba(128,128,128,.1); font-weight: 600; }
:deep(.md-token tr:nth-child(even)) { background: rgba(128,128,128,.04); }
:deep(.md-token img) { max-width: 100%; border-radius: 4px; }
</style>
