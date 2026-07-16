import { javascript } from '@codemirror/lang-javascript'
import { python, pythonLanguage } from '@codemirror/lang-python'
import { completeFromList } from '@codemirror/autocomplete'
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
import { go } from '@codemirror/lang-go'

// lang-python built-in snippets already cover: def for while try if class import from
// Add the remaining keywords that are missing
const pythonKeywords = pythonLanguage.data.of({
  autocomplete: completeFromList([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'continue', 'del', 'elif', 'else', 'except',
    'finally', 'global', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'with', 'yield',
  ].map(k => ({ label: k, type: 'keyword' }))),
})

// Map file extension (.js, .py, …) → CodeMirror language extension
export function getLangByExt(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.js': case '.jsx': case '.mjs': case '.cjs': return javascript({ jsx: true })
    case '.ts':  return javascript({ typescript: true })
    case '.tsx': return javascript({ typescript: true, jsx: true })
    case '.py':  return [python(), pythonKeywords]
    case '.html': case '.htm': return html()
    case '.css': return css()
    case '.json': case '.jsonl': return json()
    case '.sql': return sql()
    case '.xml': case '.svg': return xml()
    case '.md': case '.rst': return markdown()
    case '.yaml': case '.yml': return yaml()
    case '.c': case '.h': case '.cpp': case '.hpp': case '.cc': case '.cxx': return cpp()
    case '.java': case '.kt': case '.kts': return java()
    case '.rs':  return rust()
    case '.php': return php()
    case '.vue': return vue()
    case '.go':  return go()
    default: return null
  }
}

// Map fenced code-block language name (js, python, …) → CodeMirror language extension
export function getLangByName(name) {
  switch ((name || '').toLowerCase()) {
    case 'js': case 'javascript': case 'jsx': return javascript({ jsx: true })
    case 'ts': case 'typescript':             return javascript({ typescript: true })
    case 'tsx':                               return javascript({ typescript: true, jsx: true })
    case 'python': case 'py': return [python(), pythonKeywords]
    case 'html': case 'htm': return html()
    case 'css':              return css()
    case 'json':             return json()
    case 'sql':              return sql()
    case 'xml':              return xml()
    case 'markdown': case 'md': return markdown()
    case 'yaml': case 'yml': return yaml()
    case 'c': case 'cpp': case 'c++': case 'cc': case 'cxx': case 'h': return cpp()
    case 'java': case 'kotlin': case 'kt': return java()
    case 'rust': case 'rs': return rust()
    case 'php':             return php()
    case 'vue':             return vue()
    default:                return null
  }
}
