<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Artplayer from 'artplayer'
import zhTw from 'artplayer/i18n/zh-tw'
import JASSUB from 'jassub'
import jassubWorkerUrl from 'jassub/dist/jassub-worker.js?url'
import jassubWasmUrl from 'jassub/dist/jassub-worker.wasm?url'
import jassubModernWasmUrl from 'jassub/dist/jassub-worker-modern.wasm?url'
import cjkFallbackFontUrl from '@openfonts/noto-sans-sc_all/files/noto-sans-sc-all-400.woff2?url'

const props = defineProps({
  url:       { type: String, required: true },
  subtitles: { type: Array, default: () => [] },
  fonts:     { type: Array, default: () => [] },
  volume:    { type: Number, default: 1 },
})

const emit = defineEmits(['play', 'pause', 'volume'])
const { t, locale } = useI18n()
const container = ref(null)
let art = null
let assRenderer = null
let activeSubtitleIndex = props.subtitles.length ? 0 : -1
const subtitleIconHtml = '<i class="mdi mdi-closed-caption" aria-hidden="true"></i>'

const japanese = {
  'Video Info': '動画情報',
  Close: '閉じる',
  'Video Load Failed': '動画の読み込みに失敗しました',
  Volume: '音量',
  Play: '再生',
  Pause: '一時停止',
  Rate: '速度',
  Mute: 'ミュート',
  'Video Flip': '映像反転',
  Horizontal: '水平',
  Vertical: '垂直',
  Reconnect: '再接続',
  'Show Setting': '設定を表示',
  'Hide Setting': '設定を隠す',
  Screenshot: 'スクリーンショット',
  'Play Speed': '再生速度',
  'Aspect Ratio': 'アスペクト比',
  Default: 'デフォルト',
  Normal: '標準',
  Open: '開く',
  'Switch Video': '動画を切り替え',
  'Switch Subtitle': '字幕を切り替え',
  Fullscreen: '全画面',
  'Exit Fullscreen': '全画面を終了',
  'Web Fullscreen': 'ブラウザー内全画面',
  'Exit Web Fullscreen': 'ブラウザー内全画面を終了',
  'Mini Player': 'ミニプレーヤー',
  'PIP Mode': 'ピクチャーインピクチャー',
  'Exit PIP Mode': 'ピクチャーインピクチャーを終了',
  'PIP Not Supported': 'ピクチャーインピクチャーは利用できません',
  'Fullscreen Not Supported': '全画面表示は利用できません',
  'Subtitle Offset': '字幕の時間調整',
  'Last Seen': '前回の位置',
  'Jump Play': '続きから再生',
  AirPlay: 'AirPlay',
  'AirPlay Not Available': 'AirPlayは利用できません',
}

function artLang() {
  const lang = String(locaffprobele.value || '').toLowerCase()
  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk')) return 'zh-tw'
  if (lang.startsWith('zh')) return 'zh-cn'
  if (lang.startsWith('ja')) return 'ja'
  return 'en'
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}

function destroyAssRenderer() {
  const renderer = assRenderer
  assRenderer = null
  renderer?.destroy()
}

function showAssSubtitle(subtitle) {
  if (!art) return
  art.subtitle.show = false
  destroyAssRenderer()

  const renderer = new JASSUB({
    video: art.video,
    subUrl: subtitle.url,
    timeOffset: art.subtitleOffset || 0,
    workerUrl: jassubWorkerUrl,
    wasmUrl: jassubWasmUrl,
    modernWasmUrl: jassubModernWasmUrl,
    fonts: props.fonts.map((font) => font.url),
    availableFonts: {
      'noto sans sc': cjkFallbackFontUrl,
    },
    fallbackFont: 'noto sans sc',
    useLocalFonts: true,
  })
  assRenderer = renderer
}

function activateSubtitle(index) {
  if (!art) return
  activeSubtitleIndex = index
  if (index < 0) {
    destroyAssRenderer()
    art.subtitle.show = false
    return
  }

  const subtitle = props.subtitles[index]
  if (!subtitle) return
  if (subtitle.type === 'ass') {
    showAssSubtitle(subtitle)
    return
  }

  destroyAssRenderer()
  art.subtitle.switch(subtitle.url, {
    name: subtitle.label,
    type: subtitle.type || 'vtt',
    encoding: 'utf-8',
    escape: true,
  }).then(() => {
    if (art) art.subtitle.show = true
  }).catch((error) => {
    if (art) art.notice.show = error
  })
}

function subtitleControl() {
  if (!props.subtitles.length) return []

  const selector = [
    {
      default: activeSubtitleIndex < 0,
      html: escapeHtml(t('media.subtitleOff')),
      index: -1,
    },
    ...props.subtitles.map((subtitle, index) => ({
      default: activeSubtitleIndex === index,
      html: escapeHtml(subtitle.label || t('media.subtitleTrack', { n: index + 1 })),
      index,
      subtitle,
    })),
  ]

  return [{
    name: 'subtitle-selector',
    position: 'right',
    html: subtitleIconHtml,
    selector,
    onSelect(item) {
      activateSubtitle(item.index)
      return subtitleIconHtml
    },
  }]
}

function destroy() {
  destroyAssRenderer()
  if (!art) return
  art.destroy(false)
  art = null
}

async function create(playbackState = null) {
  destroy()
  await nextTick()
  if (!container.value || !props.url) return

  art = new Artplayer({
    container: container.value,
    url: props.url,
    volume: props.volume,
    autoplay: playbackState?.playing ?? true,
    lang: artLang(),
    i18n: {
      'zh-tw': zhTw,
      ja: japanese,
    },
    theme: '#7c4dff',
    setting: true,
    playbackRate: true,
    aspectRatio: true,
    subtitleOffset: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    hotkey: false,
    mutex: true,
    controls: subtitleControl(),
    moreVideoAttr: {
      playsInline: true,
      preload: 'metadata',
    },
  })

  art.on('video:play', () => emit('play'))
  art.on('video:pause', () => emit('pause'))
  art.on('video:ended', () => emit('pause'))
  art.on('video:volumechange', () => emit('volume', art.volume))
  art.on('subtitleOffset', (offset) => {
    if (assRenderer) assRenderer.timeOffset = offset
  })
  if (playbackState) {
    art.on('ready', () => {
      art.currentTime = playbackState.currentTime
      activateSubtitle(playbackState.subtitleIndex)
      if (!playbackState.playing) art.pause()
    })
  } else if (activeSubtitleIndex >= 0) {
    art.on('ready', () => activateSubtitle(activeSubtitleIndex))
  }
}

function recreateForLocale() {
  if (!art) return
  const playbackState = {
    currentTime: art.currentTime,
    playing: art.playing,
    subtitleIndex: activeSubtitleIndex,
  }
  void create(playbackState)
}

function toggle() {
  art?.toggle()
}

function seekBy(seconds) {
  if (!art) return
  art.currentTime = Math.max(0, Math.min(art.duration || 0, art.currentTime + seconds))
}

defineExpose({ toggle, seekBy })

onMounted(create)
onBeforeUnmount(destroy)
watch(() => [props.url, props.subtitles, props.fonts], () => {
  activeSubtitleIndex = props.subtitles.length ? 0 : -1
  void create()
}, { deep: true })
watch(locale, recreateForLocale)
</script>

<template>
  <div ref="container" class="art-video-player" />
</template>

<style scoped>
.art-video-player {
  width: 100%;
  height: 100%;
  background: #000;
}

.art-video-player :deep(.JASSUB) {
  z-index: 20;
}

.art-video-player :deep(.art-control-subtitle-selector .mdi) {
  font-size: 22px;
}
</style>
