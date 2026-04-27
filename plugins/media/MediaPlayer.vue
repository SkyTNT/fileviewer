<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, inject } from 'vue'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const services   = inject('services')
const mediaApi   = services?.get('media.api')
const fileStore  = services?.get('explorer.state')
const eventBus   = services?.get('event.bus')
const mediaEl    = ref(null)
const videoWrapper = ref(null)

const playing      = ref(false)
const currentTime  = ref(0)
const duration     = ref(0)
const volume       = ref(Number(localStorage.getItem('fv-media-volume') ?? 1))
const muted        = ref(false)
const buffered     = ref(0)
const showControls = ref(true)
const showCenterIcon = ref(false)
const centerIconPlay = ref(false)
const isDragging   = ref(false)
const dragValue    = ref(0)
const isFullscreen  = ref(false)
const activeSubIdx  = ref(-1)

let hideTimer = null

const isVideo = computed(() => {
  const ext = (props.file?.extension || '').toLowerCase()
  return ['.mp4','.webm','.ogv','.avi','.mov','.mkv','.flv','.wmv','.m4v','.ts'].includes(ext)
})

const mediaUrl    = computed(() => props.file ? mediaApi.streamUrl(props.file.path) : '')
const coverUrl    = computed(() => props.file ? mediaApi.thumbnailUrl(props.file.path, 400) : '')
const fileName    = computed(() => props.file?.name || '')
const subtitles   = computed(() => props.file?.subtitles || [])
const subLabel    = computed(() => activeSubIdx.value >= 0 ? (subtitles.value[activeSubIdx.value]?.label || String(activeSubIdx.value + 1)) : null)

const hasCover    = ref(false)
const coverFailed = ref(false)
const coverCircle = ref(true)

// ── track list navigation ─────────────────────────────
const audioEntries  = computed(() => fileStore?.displayedEntries?.filter(f => f.type === 'audio') ?? [])
const trackIndex    = computed(() => audioEntries.value.findIndex(f => f.path === props.file?.path))
const prevTrack     = computed(() => trackIndex.value > 0 ? audioEntries.value[trackIndex.value - 1] : null)
const nextTrack     = computed(() => trackIndex.value >= 0 && trackIndex.value < audioEntries.value.length - 1 ? audioEntries.value[trackIndex.value + 1] : null)

function navigatePrev() { if (prevTrack.value) props.winManager?.setProps(props.winId, { file: prevTrack.value }) }
function navigateNext() { if (nextTrack.value) props.winManager?.setProps(props.winId, { file: nextTrack.value }) }

watch(() => props.file, () => { hasCover.value = false; coverFailed.value = false }, { immediate: true })

function onCoverLoad()  { hasCover.value = true }
function onCoverError() { coverFailed.value = true }
function toggleCoverStyle() { if (hasCover.value) coverCircle.value = !coverCircle.value }
const progressPct = computed(() => {
  if (isDragging.value) return dragValue.value
  return duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0
})
const bufferedPct = computed(() => duration.value > 0 ? (buffered.value / duration.value) * 100 : 0)
const volumeValue = computed(() => muted.value ? 0 : Math.round(volume.value * 100))
const volumeIcon  = computed(() => {
  if (muted.value || volume.value === 0) return 'mdi-volume-off'
  if (volume.value < 0.4) return 'mdi-volume-low'
  if (volume.value < 0.7) return 'mdi-volume-medium'
  return 'mdi-volume-high'
})

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

function togglePlay() {
  if (!mediaEl.value) return
  if (playing.value) { mediaEl.value.pause() } else { mediaEl.value.play() }
  if (isVideo.value) {
    centerIconPlay.value = !playing.value
    showCenterIcon.value = true
    setTimeout(() => { showCenterIcon.value = false }, 700)
  }
}

function onPlay()  { playing.value = true;  if (!isVideo.value) { ensureAudioCtx(); audioCtx?.resume() } }
function onPause() { playing.value = false }
function onEnded() { playing.value = false }

function onTimeUpdate() {
  if (!isDragging.value) currentTime.value = mediaEl.value?.currentTime || 0
  if (mediaEl.value?.buffered?.length > 0)
    buffered.value = mediaEl.value.buffered.end(mediaEl.value.buffered.length - 1)
}
function onLoaded() {
  duration.value = mediaEl.value?.duration || 0
  if (mediaEl.value) mediaEl.value.volume = volume.value
  mediaEl.value?.play()
}

// ── seek bar ──────────────────────────────────────────
function getSeekPct(e, el) {
  const rect = el.getBoundingClientRect()
  return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
}

function onSeekPointerDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId)
  isDragging.value = true
  dragValue.value = getSeekPct(e, e.currentTarget)
}
function onSeekPointerMove(e) {
  if (!isDragging.value) return
  dragValue.value = getSeekPct(e, e.currentTarget)
}
function onSeekPointerUp(e) {
  if (!isDragging.value) return
  const pct = getSeekPct(e, e.currentTarget)
  const newTime = (pct / 100) * duration.value
  currentTime.value = newTime
  if (mediaEl.value) mediaEl.value.currentTime = newTime
  isDragging.value = false
}

// ── volume ────────────────────────────────────────────
function setVolume(val) {
  volume.value = val / 100
  muted.value = val === 0
  localStorage.setItem('fv-media-volume', val / 100)
  if (mediaEl.value) { mediaEl.value.volume = val / 100; mediaEl.value.muted = val === 0 }
}
function toggleMute() {
  muted.value = !muted.value
  if (mediaEl.value) mediaEl.value.muted = muted.value
}
function onVolumeInput(e) { setVolume(Number(e.target.value)) }

// ── video controls visibility ─────────────────────────
function scheduleHide() {
  clearTimeout(hideTimer)
  if (playing.value) hideTimer = setTimeout(() => { showControls.value = false }, 3000)
}
function onMouseMove() {
  if (!isVideo.value) return
  showControls.value = true
  scheduleHide()
}
function onMouseLeave() {
  if (!isVideo.value) return
  scheduleHide()
}
function onVideoClick(e) {
  e.preventDefault()
  togglePlay()
  showControls.value = true
  scheduleHide()
}

// ── spectrum ──────────────────────────────────────────
const spectrumCanvas = ref(null)
let audioCtx  = null
let analyser  = null
let animFrame = null

function ensureAudioCtx() {
  if (audioCtx || isVideo.value || !mediaEl.value) return
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    analyser  = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.82
    audioCtx.createMediaElementSource(mediaEl.value).connect(analyser)
    analyser.connect(audioCtx.destination)
    drawSpectrum()
  } catch { /* unsupported */ }
}

function drawSpectrum() {
  animFrame = requestAnimationFrame(drawSpectrum)
  const canvas = spectrumCanvas.value
  if (!canvas || !analyser) return

  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  if (!W || !H) return
  if (canvas.width  !== Math.round(W * dpr)) canvas.width  = Math.round(W * dpr)
  if (canvas.height !== Math.round(H * dpr)) canvas.height = Math.round(H * dpr)

  const c  = canvas.getContext('2d')
  const cw = canvas.width, ch = canvas.height
  c.clearRect(0, 0, cw, ch)

  const freq = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(freq)

  const rgb = getComputedStyle(canvas).getPropertyValue('--v-theme-primary').trim() || '99,102,241'
  const N   = 56
  const gap = Math.round(2 * dpr)
  const bw  = (cw - gap * (N - 1)) / N

  for (let i = 0; i < N; i++) {
    const t   = i / (N - 1)
    const bin = Math.round(Math.pow(freq.length * 0.75, t))
    const v   = (freq[Math.min(bin, freq.length - 1)] || 0) / 255
    const bh  = Math.max(2, v * ch * 0.95)
    const x   = i * (bw + gap)
    const y   = ch - bh
    const r   = Math.min(bw / 2, 3 * dpr)

    const g = c.createLinearGradient(0, y, 0, ch)
    g.addColorStop(0, `rgba(${rgb},0.9)`)
    g.addColorStop(1, `rgba(${rgb},0.3)`)
    c.fillStyle = g

    c.beginPath()
    c.moveTo(x + r, y)
    c.lineTo(x + bw - r, y)
    c.arcTo(x + bw, y, x + bw, y + r, r)
    c.lineTo(x + bw, ch)
    c.lineTo(x, ch)
    c.lineTo(x, y + r)
    c.arcTo(x, y, x + r, y, r)
    c.closePath()
    c.fill()
  }
}

function stopSpectrum() {
  cancelAnimationFrame(animFrame)
  animFrame = null
}

// ── fullscreen ────────────────────────────────────────
function toggleFullscreen() {
  if (!videoWrapper.value) return
  document.fullscreenElement ? document.exitFullscreen() : videoWrapper.value.requestFullscreen()
}
function onFsChange() { isFullscreen.value = !!document.fullscreenElement }

function applySubMode() {
  const tracks = mediaEl.value?.textTracks
  if (!tracks) return
  for (let i = 0; i < tracks.length; i++)
    tracks[i].mode = i === activeSubIdx.value ? 'showing' : 'hidden'
}

function cycleSubtitle() {
  const count = subtitles.value.length
  if (!count) return
  activeSubIdx.value = activeSubIdx.value >= count - 1 ? -1 : activeSubIdx.value + 1
  nextTick(applySubMode)
}

function onKey({ key, raw }) {
  if (isVideo.value) return
  if (key === 'ArrowLeft')  { raw.preventDefault(); navigatePrev() }
  if (key === 'ArrowRight') { raw.preventDefault(); navigateNext() }
}

onMounted(() => {
  nextTick(() => mediaEl.value?.load())
  document.addEventListener('fullscreenchange', onFsChange)
  eventBus?.on('keyboard:keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  clearTimeout(hideTimer)
  stopSpectrum()
  audioCtx?.close()
  eventBus?.off('keyboard:keydown', onKey)
})
watch(() => props.file, (f) => {
  playing.value = false; currentTime.value = 0; duration.value = 0
  activeSubIdx.value = -1
  if (f) props.winManager?.setTitle(props.winId, f.name)
  nextTick(() => mediaEl.value?.load())
})
</script>

<template>
  <!-- ═══════════════ AUDIO PLAYER ═══════════════ -->
  <div v-if="!isVideo" class="audio-player">
    <div class="audio-glow" />

    <!-- album art / vinyl record -->
    <div class="art-wrap" @click="toggleCoverStyle" :style="hasCover ? 'cursor:pointer' : ''">
      <!-- cover: square mode -->
      <img
        v-show="hasCover && !coverCircle"
        :src="coverUrl"
        class="cover-img"
        :class="{ 'cover-img--playing': playing }"
        @load="onCoverLoad"
        @error="onCoverError"
        alt=""
      />
      <!-- cover: circle/vinyl mode -->
      <div v-show="hasCover && coverCircle" class="vinyl" :class="{ 'vinyl--spin': playing }">
        <img
          :src="coverUrl"
          class="cover-vinyl-img"
          alt=""
        />
        <div class="vinyl-ring vinyl-ring-1"/>
        <div class="vinyl-ring vinyl-ring-2"/>
        <div class="vinyl-center-dot"/>
      </div>
      <!-- vinyl fallback (no cover) -->
      <div v-show="!hasCover" class="vinyl" :class="{ 'vinyl--spin': playing }">
        <div class="vinyl-ring vinyl-ring-1"/>
        <div class="vinyl-ring vinyl-ring-2"/>
        <div class="vinyl-ring vinyl-ring-3"/>
        <div class="vinyl-hole">
          <v-icon size="28" style="color: rgb(var(--v-theme-on-primary)); opacity:0.85">mdi-music-note</v-icon>
        </div>
      </div>
    </div>

    <!-- track info -->
    <div class="audio-info">
      <div class="audio-title text-body-1 font-weight-medium">{{ fileName }}</div>
    </div>

    <!-- spectrum -->
    <canvas ref="spectrumCanvas" class="spectrum-canvas" />

    <!-- time labels -->
    <div class="audio-times">
      <span class="text-caption">{{ fmt(currentTime) }}</span>
      <span class="text-caption">{{ fmt(duration) }}</span>
    </div>

    <!-- seek bar -->
    <div
      class="seek-container"
      @pointerdown="onSeekPointerDown"
      @pointermove="onSeekPointerMove"
      @pointerup="onSeekPointerUp"
    >
      <div class="seek-track">
        <div class="seek-buffered" :style="{ width: bufferedPct + '%' }"/>
        <div class="seek-fill" :style="{ width: progressPct + '%' }"/>
        <div class="seek-thumb" :style="{ left: progressPct + '%' }"/>
      </div>
    </div>

    <!-- controls + volume row -->
    <div class="audio-controls">
      <!-- left: volume -->
      <div class="audio-volume">
        <button class="vol-icon-btn" @click="toggleMute" type="button">
          <v-icon :size="18">{{ volumeIcon }}</v-icon>
        </button>
        <input
          type="range" class="vol-range"
          min="0" max="100" :value="volumeValue"
          @input="onVolumeInput"
        />
      </div>

      <!-- center: prev + play + next -->
      <div class="ctrl-center">
        <button class="skip-btn" @click="navigatePrev" :disabled="!prevTrack" type="button">
          <v-icon size="26">mdi-skip-previous</v-icon>
        </button>
        <button class="play-btn" @click="togglePlay" type="button">
          <v-icon :size="64" color="primary">{{ playing ? 'mdi-pause-circle-outline' : 'mdi-play-circle-outline' }}</v-icon>
        </button>
        <button class="skip-btn" @click="navigateNext" :disabled="!nextTrack" type="button">
          <v-icon size="26">mdi-skip-next</v-icon>
        </button>
      </div>

      <!-- right: track counter -->
      <div class="track-counter">
        <span v-if="audioEntries.length > 1" class="text-caption">
          {{ trackIndex + 1 }} / {{ audioEntries.length }}
        </span>
      </div>
    </div>

    <audio
      ref="mediaEl" :src="mediaUrl"
      @play="onPlay" @pause="onPause"
      @timeupdate="onTimeUpdate" @loadedmetadata="onLoaded" @ended="onEnded"
    />
  </div>

  <!-- ═══════════════ VIDEO PLAYER ═══════════════ -->
  <div
    v-else
    ref="videoWrapper"
    class="video-player"
    :class="{ 'hide-cursor': playing && !showControls }"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <video
      ref="mediaEl" :src="mediaUrl" class="video-el"
      @play="onPlay" @pause="onPause"
      @timeupdate="onTimeUpdate" @loadedmetadata="onLoaded" @ended="onEnded"
      @click="onVideoClick"
    >
      <track
        v-for="(sub, i) in subtitles" :key="sub.url"
        kind="subtitles"
        :srclang="sub.lang || 'und'"
        :label="sub.label"
        :src="sub.url"
      />
    </video>

    <!-- center play/pause flash -->
    <transition name="center-flash">
      <div v-if="showCenterIcon" class="center-flash-wrap">
        <div class="center-flash-circle">
          <v-icon size="52" color="white">{{ centerIconPlay ? 'mdi-play' : 'mdi-pause' }}</v-icon>
        </div>
      </div>
    </transition>

    <!-- controls overlay -->
    <transition name="ctrl-fade">
      <div v-show="showControls" class="video-ctrl-wrap">
        <div class="video-ctrl-bar">
          <!-- seek -->
          <div
            class="v-seek-container"
            @pointerdown="onSeekPointerDown"
            @pointermove="onSeekPointerMove"
            @pointerup="onSeekPointerUp"
          >
            <div class="v-seek-track">
              <div class="v-seek-buffered" :style="{ width: bufferedPct + '%' }"/>
              <div class="v-seek-fill" :style="{ width: progressPct + '%' }"/>
              <div class="v-seek-thumb" :style="{ left: progressPct + '%' }"/>
            </div>
          </div>

          <!-- bottom row -->
          <div class="video-ctrl-row">
            <div class="ctrl-left">
              <v-btn icon variant="text" size="small" @click.stop="togglePlay">
                <v-icon size="22" color="white">{{ playing ? 'mdi-pause' : 'mdi-play' }}</v-icon>
              </v-btn>
              <v-btn icon variant="text" size="small" @click.stop="toggleMute">
                <v-icon size="20" color="white">{{ volumeIcon }}</v-icon>
              </v-btn>
              <input
                type="range" class="vol-range vol-range--video"
                min="0" max="100" :value="volumeValue"
                @input="onVolumeInput" @click.stop
              />
              <span class="ctrl-time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
            </div>
            <div class="ctrl-right">
              <v-btn
                v-if="subtitles.length"
                icon variant="text" size="small"
                :title="subLabel ? `字幕: ${subLabel}` : '字幕关闭'"
                @click.stop="cycleSubtitle"
              >
                <v-icon size="20" :color="subLabel ? 'primary' : 'white'">mdi-closed-caption</v-icon>
              </v-btn>
              <v-btn icon variant="text" size="small" @click.stop="toggleFullscreen">
                <v-icon size="20" color="white">{{ isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}</v-icon>
              </v-btn>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* ── shared tokens ─────────────────────────────────────── */
.seek-container,
.v-seek-container {
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

/* ══════════════════════════════════════════════════════════
   AUDIO PLAYER
══════════════════════════════════════════════════════════ */
.audio-player {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  padding: 24px 32px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}

/* radial glow from primary color */
.audio-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% -10%,
    rgba(var(--v-theme-primary), 0.18) 0%,
    transparent 70%);
  pointer-events: none;
}

/* art area ──────────────────────────────────── */
.art-wrap {
  position: relative;
  margin-bottom: 4px;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-img {
  width: 200px;
  height: 200px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow:
    0 8px 32px rgba(0,0,0,0.45),
    0 0 40px rgba(var(--v-theme-primary), 0.15);
  transition: box-shadow 0.4s ease;
}
.cover-img--playing {
  box-shadow:
    0 12px 48px rgba(0,0,0,0.5),
    0 0 60px rgba(var(--v-theme-primary), 0.25);
}

/* cover vinyl overlay ───────────────────────── */
.cover-vinyl-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  opacity: 0.88;
}

.vinyl-center-dot {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(0,0,0,0.7);
  border: 2px solid rgba(255,255,255,0.18);
  z-index: 2;
}

/* vinyl record ─────────────────────────────── */

.vinyl {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%,
      rgba(var(--v-theme-primary), 0.9) 0%,
      rgba(var(--v-theme-primary), 0.6) 30%,
      #1a1a1a 31%,
      #222 34%,
      #1a1a1a 35%,
      #222 45%,
      #1a1a1a 46%,
      #222 56%,
      #1a1a1a 57%,
      #222 70%,
      #111 100%);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 8px 32px rgba(0,0,0,0.45),
    0 0 40px rgba(var(--v-theme-primary), 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: vinyl-spin 4s linear infinite;
  animation-play-state: paused;
  transition: box-shadow 0.4s ease;
}

.vinyl--spin {
  animation-play-state: running;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 12px 48px rgba(0,0,0,0.5),
    0 0 60px rgba(var(--v-theme-primary), 0.22);
}

@keyframes vinyl-spin { to { transform: rotate(360deg) } }

.vinyl-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.04);
}
.vinyl-ring-1 { inset: 36px; }
.vinyl-ring-2 { inset: 54px; }
.vinyl-ring-3 { inset: 70px; }

.vinyl-hole {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(var(--v-theme-primary)) 0%, rgba(var(--v-theme-primary), 0.7) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  z-index: 1;
}

/* track info ───────────────────────────────── */
.audio-info {
  text-align: center;
  max-width: 460px;
}
.audio-title {
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
  letter-spacing: 0.01em;
}

/* spectrum canvas ───────────────────────────── */
.spectrum-canvas {
  width: 100%;
  max-width: 420px;
  height: 56px;
  display: block;
  flex-shrink: 0;
}

/* times ─────────────────────────────────────── */
.audio-times {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 420px;
  opacity: 0.55;
  padding: 0 2px;
  font-variant-numeric: tabular-nums;
}

/* seek bar ──────────────────────────────────── */
.seek-container {
  width: 100%;
  max-width: 420px;
  padding: 8px 0;
}

.seek-track {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  transition: height 0.15s ease;
}
.seek-container:hover .seek-track { height: 6px; }

.seek-buffered {
  position: absolute;
  inset: 0;
  right: auto;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.18);
}
.seek-fill {
  position: absolute;
  inset: 0;
  right: auto;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
}
.seek-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) scale(0);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  transition: transform 0.15s ease;
  pointer-events: none;
}
.seek-container:hover .seek-thumb { transform: translate(-50%, -50%) scale(1); }

/* controls row ──────────────────────────────── */
.audio-controls {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 420px;
}

.ctrl-center {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.play-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, opacity 0.15s ease;
  outline: none;
  color: inherit;
}
.play-btn:hover  { opacity: 0.82; transform: scale(1.06); }
.play-btn:active { transform: scale(0.94); }

.skip-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.6;
  transition: opacity 0.15s, transform 0.15s;
  outline: none;
}
.skip-btn:hover:not(:disabled)  { opacity: 1; transform: scale(1.08); }
.skip-btn:active:not(:disabled) { transform: scale(0.92); }
.skip-btn:disabled { opacity: 0.2; cursor: default; }

.track-counter {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  opacity: 0.45;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* volume ─────────────────────────────────────── */
.audio-volume {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.65;
  transition: opacity 0.2s;
  flex: 1;
}
.audio-volume:hover { opacity: 1; }

.vol-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.75;
  transition: opacity 0.15s;
  outline: none;
  flex-shrink: 0;
}
.vol-icon-btn:hover { opacity: 1; }

/* ── shared volume range ─────────────────────── */
.vol-range {
  -webkit-appearance: none;
  appearance: none;
  width: 90px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-primary)) calc(v-bind(volumeValue) * 1%),
    rgba(var(--v-theme-on-surface), 0.18) calc(v-bind(volumeValue) * 1%),
    rgba(var(--v-theme-on-surface), 0.18) 100%
  );
  outline: none;
  cursor: pointer;
}
.vol-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.vol-range::-moz-range-thumb {
  width: 12px; height: 12px;
  border: none;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}


/* ══════════════════════════════════════════════════════════
   VIDEO PLAYER
══════════════════════════════════════════════════════════ */
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
.video-player.hide-cursor { cursor: none; }

.video-el {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* center flash ──────────────────────────────── */
.center-flash-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.center-flash-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.center-flash-enter-active,
.center-flash-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.center-flash-enter-from   { opacity: 0; transform: scale(0.7); }
.center-flash-leave-to     { opacity: 0; transform: scale(1.2); }

/* controls overlay ──────────────────────────── */
.video-ctrl-wrap {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.72) 100%);
  padding: 40px 16px 10px;
}
.ctrl-fade-enter-active,
.ctrl-fade-leave-active { transition: opacity 0.25s ease; }
.ctrl-fade-enter-from,
.ctrl-fade-leave-to { opacity: 0; }

/* video seek ────────────────────────────────── */
.v-seek-container {
  padding: 6px 0;
  margin-bottom: 2px;
}
.v-seek-track {
  position: relative;
  height: 3px;
  border-radius: 2px;
  background: rgba(255,255,255,0.2);
  transition: height 0.15s ease;
}
.v-seek-container:hover .v-seek-track { height: 5px; }

.v-seek-buffered {
  position: absolute;
  inset: 0; right: auto;
  border-radius: 2px;
  background: rgba(255,255,255,0.28);
}
.v-seek-fill {
  position: absolute;
  inset: 0; right: auto;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
}
.v-seek-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) scale(0);
  width: 13px; height: 13px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  transition: transform 0.15s ease;
  pointer-events: none;
}
.v-seek-container:hover .v-seek-thumb { transform: translate(-50%, -50%) scale(1); }

/* video bottom row ──────────────────────────── */
.video-ctrl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ctrl-left, .ctrl-right {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ctrl-time {
  font-size: 12px;
  color: rgba(255,255,255,0.85);
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
  white-space: nowrap;
}

.vol-range--video {
  width: 72px;
  background: linear-gradient(
    to right,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-primary)) calc(v-bind(volumeValue) * 1%),
    rgba(255,255,255,0.25) calc(v-bind(volumeValue) * 1%),
    rgba(255,255,255,0.25) 100%
  );
}
</style>
