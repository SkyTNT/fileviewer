<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  value: { required: true },
  keyName: { default: null },
  depth: { type: Number, default: 0 },
  initialExpanded: { type: Boolean, default: true },
})

const { t } = useI18n()
const expanded = ref(props.depth < 2 ? props.initialExpanded : false)

const isObject = computed(() => props.value !== null && typeof props.value === 'object' && !Array.isArray(props.value))
const isArray = computed(() => Array.isArray(props.value))
const isComplex = computed(() => isObject.value || isArray.value)

const childCount = computed(() => {
  if (isObject.value) return Object.keys(props.value).length
  if (isArray.value) return props.value.length
  return 0
})

const entries = computed(() => {
  if (isObject.value) return Object.entries(props.value)
  if (isArray.value) return props.value.map((v, i) => [i, v])
  return []
})

const displayValue = computed(() => {
  if (props.value === null) return 'null'
  if (typeof props.value === 'string') return JSON.stringify(props.value)
  return String(props.value)
})

const valueClass = computed(() => {
  if (props.value === null) return 'val-null'
  if (typeof props.value === 'boolean') return 'val-bool'
  if (typeof props.value === 'number') return 'val-num'
  if (typeof props.value === 'string') return 'val-str'
  return ''
})
</script>

<template>
  <div class="json-node">
    <span v-if="keyName !== null" class="key">"{{ keyName }}": </span>

    <template v-if="isComplex">
      <span class="bracket toggle" @click="expanded = !expanded">
        {{ expanded ? (isArray ? '[' : '{') : (isArray ? '[...]' : '{...}') }}
        <span class="count text-grey" v-if="!expanded"> {{ t('jsonNode.items', { n: childCount }) }}</span>
      </span>
      <template v-if="expanded">
        <div class="children">
          <JsonNode
            v-for="[k, v] in entries"
            :key="k"
            :value="v"
            :key-name="k"
            :depth="depth + 1"
          />
        </div>
        <span class="bracket">{{ isArray ? ']' : '}' }}</span>
      </template>
    </template>

    <span v-else :class="valueClass">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
.json-node {
  font-family: 'Roboto Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding-left: 16px;
  position: relative;
}
.key { color: #9cdcfe; }
.val-str { color: #ce9178; }
.val-num { color: #b5cea8; }
.val-bool { color: #569cd6; }
.val-null { color: #808080; }
.bracket { color: #d4d4d4; }
.toggle { cursor: pointer; user-select: none; }
.toggle:hover { opacity: 0.8; }
.children {
  border-left: 1px solid rgba(255,255,255,0.1);
  margin-left: 4px;
}
.count { font-size: 11px; }
</style>
