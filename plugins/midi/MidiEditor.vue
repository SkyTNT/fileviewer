<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import spessaWorkletUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url'

const props = defineProps({
  file:       { type: Object, required: true },
  winId:      { type: String, default: null },
  winManager: { type: Object, default: null },
})

const { t } = useI18n()
const services = inject('services')
const midiApi  = services?.get('midi.api')
const http     = services?.get('network.http')
const eventBus = services?.get('event.bus')

// ── Constants ─────────────────────────────────────────────────────────────────
const KEYS_W  = 72    // piano key strip width
const RULER_H = 32    // top ruler height
const VEL_H   = 72    // bottom velocity lane height
const NOTE_H  = 9     // base pixels per semitone
const BASE_PPB = 120  // base pixels per beat at zoom 1x

const IS_BLACK = [false,true,false,true,false,false,true,false,true,false,true,false]
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const TRACK_COLORS = ['#4ade80','#60a5fa','#f87171','#fb923c','#a78bfa','#34d399','#f472b6','#facc15','#22d3ee','#e879f9']
const QUANTIZE_OPTS = [
  {title:'1/4',  value: 4 },
  {title:'1/8',  value: 8 },
  {title:'1/16', value: 16},
  {title:'1/32', value: 32},
]

const GM_INSTRUMENTS = [
  'Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano',
  'Electric Piano 1','Electric Piano 2','Harpsichord','Clavi',
  'Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer',
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion',
  'Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)',
  'Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar Harmonics',
  'Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass',
  'Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  'Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani',
  'String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2',
  'Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  'Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet',
  'Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina',
  'Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)',
  'Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass+lead)',
  'Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)',
  'Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)',
  'FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)',
  'FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)',
  'Sitar','Banjo','Shamisen','Koto','Kalimba','Bag pipe','Fiddle','Shanai',
  'Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  'Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot',
]
const GM_ITEMS = GM_INSTRUMENTS.map((name, i) => ({ title: `${i + 1}. ${name}`, value: i }))

// ── State ─────────────────────────────────────────────────────────────────────
const loading   = ref(true)
const error     = ref(null)
const saving    = ref(false)

// MIDI data
const ppq       = ref(480)
const tempos    = ref([{ tick: 0, tempo: 500000 }])
const timeSigs  = ref([{ tick: 0, num: 4, den: 4 }])
const trackData = ref([])   // { index, name, channel, color, muted, solo, notes, events }
const totalTicks = ref(0)

// Playback
const playing     = ref(false)
const currentTick = ref(0)
const looping     = ref(false)
const loopStart   = ref(0)
const loopEnd     = ref(0)

// SoundFont
const sfLoaded   = ref(false)
const sfLoading  = ref(false)
const sfError    = ref(null)
const DEFAULT_SF_URL = '/api/midi/soundfont/default'
const sfUrlInput = ref(localStorage.getItem('fv-midi-soundfont') || DEFAULT_SF_URL)
const showSFDialog = ref(false)

// Editor view
const quantize   = ref(16)
const activeTrack = ref(0)
const zoomX      = ref(1.0)
const zoomY      = ref(1.0)
const scrollX    = ref(0)
const scrollY    = ref(0)

// Canvas refs
const canvasRef  = ref(null)
const rollRef    = ref(null)

// SpessaSynth instances (non-reactive)
let audioCtx = null
let synth    = null
let seq      = null

// Animation state
let animFrameId  = null
let rafDirtyId   = null

// Drag interaction state
let drag = null  // { type, startX, startY, startTick, startNote, note, track, origStart, origNote }
let noteIdSeq = 0

// ── Computed ──────────────────────────────────────────────────────────────────
const soloActive = computed(() => trackData.value.some(t => t.solo))

const currentBpm = computed(() => {
  const sorted = [...tempos.value].sort((a, b) => a.tick - b.tick)
  let last = 500000
  for (const tc of sorted) {
    if (tc.tick > currentTick.value) break
    last = tc.tempo
  }
  return Math.round(60000000 / last)
})

const positionDisplay = computed(() => {
  const ts = timeSigs.value[0] || { num: 4, den: 4 }
  const ticksPerBar = ppq.value * ts.num * (4 / ts.den)
  const bar  = Math.floor(currentTick.value / ticksPerBar) + 1
  const beat = Math.floor((currentTick.value % ticksPerBar) / ppq.value) + 1
  const tick = Math.floor(currentTick.value % ppq.value)
  return `${bar}:${beat}:${String(tick).padStart(3,'0')}`
})

// ── Unit conversions ──────────────────────────────────────────────────────────
function ticksToPx(ticks) {
  return ticks * zoomX.value * BASE_PPB / ppq.value
}
function pxToTicks(px) {
  return Math.round(px * ppq.value / (zoomX.value * BASE_PPB))
}
function rowHeight() { return NOTE_H * zoomY.value }
function noteToY(note) { return (127 - note) * rowHeight() }
function yToNote(y) { return Math.max(0, Math.min(127, 127 - Math.floor(y / rowHeight()))) }

function quantizeTick(tick) {
  const q = ppq.value * 4 / quantize.value
  return Math.round(tick / q) * q
}
function defaultDuration() { return Math.max(1, ppq.value * 4 / quantize.value) }

function ticksToSeconds(tick) {
  const sorted = [...tempos.value].sort((a, b) => a.tick - b.tick)
  let time = 0, lastTick = 0, lastTempo = 500000
  for (const tc of sorted) {
    if (tc.tick >= tick) break
    time += (tc.tick - lastTick) * lastTempo / ppq.value / 1e6
    lastTick = tc.tick; lastTempo = tc.tempo
  }
  return time + (tick - lastTick) * lastTempo / ppq.value / 1e6
}

function secondsToTicks(sec) {
  const sorted = [...tempos.value].sort((a, b) => a.tick - b.tick)
  let time = 0, lastTick = 0, lastTempo = 500000
  for (const tc of sorted) {
    const dt = (tc.tick - lastTick) * lastTempo / ppq.value / 1e6
    if (time + dt >= sec) break
    time += dt; lastTick = tc.tick; lastTempo = tc.tempo
  }
  return lastTick + Math.round((sec - time) * 1e6 / lastTempo * ppq.value)
}

// ── MIDI parser ───────────────────────────────────────────────────────────────
function readVarLen(buf, pos) {
  let val = 0, b
  do { b = buf[pos++]; val = (val << 7) | (b & 0x7F) } while (b & 0x80)
  return { value: val, end: pos }
}

function parseMidi(buffer) {
  const buf = new Uint8Array(buffer)
  if (buf[0] !== 0x4D || buf[1] !== 0x54 || buf[2] !== 0x68 || buf[3] !== 0x64)
    throw new Error('Not a valid MIDI file')
  let pos = 4
  const headerLen = (buf[pos]<<24|buf[pos+1]<<16|buf[pos+2]<<8|buf[pos+3])>>>0; pos+=4
  const format    = (buf[pos]<<8)|buf[pos+1]; pos+=2
  const numTracks = (buf[pos]<<8)|buf[pos+1]; pos+=2
  const timeDivision = (buf[pos]<<8)|buf[pos+1]; pos+=2
  if (timeDivision & 0x8000) throw new Error('SMPTE time division not supported')
  pos += headerLen - 6

  const tracks = []
  for (let t = 0; t < numTracks; t++) {
    while (pos < buf.length &&
           !(buf[pos]===0x4D && buf[pos+1]===0x54 && buf[pos+2]===0x72 && buf[pos+3]===0x6B)) {
      pos += 4
      const skip = (buf[pos]<<24|buf[pos+1]<<16|buf[pos+2]<<8|buf[pos+3])>>>0; pos += 4 + skip
    }
    if (pos >= buf.length) break
    pos += 4
    const trackLen = (buf[pos]<<24|buf[pos+1]<<16|buf[pos+2]<<8|buf[pos+3])>>>0; pos+=4
    const trackEnd = pos + trackLen
    const events = []; let tick = 0, rs = 0

    while (pos < trackEnd) {
      const dv = readVarLen(buf, pos); pos = dv.end; tick += dv.value
      let status = buf[pos]
      if (status & 0x80) {
        status = buf[pos++]
        if (status !== 0xFF && status !== 0xF0 && status !== 0xF7) rs = status
      } else {
        if (!rs) { continue }
        status = rs
      }

      if (status === 0xFF) {
        const mt = buf[pos++]
        const ml = readVarLen(buf, pos); pos = ml.end
        const md = buf.slice(pos, pos + ml.value); pos += ml.value
        if (mt === 0x51 && ml.value === 3) events.push({ tick, type:'tempo', tempo:(md[0]<<16)|(md[1]<<8)|md[2] })
        else if (mt === 0x03) events.push({ tick, type:'trackName', name: new TextDecoder('utf-8',{fatal:false}).decode(md) })
        else if (mt === 0x58) events.push({ tick, type:'timeSig', num:md[0], den:1<<md[1] })
        else if (mt === 0x2F) break
        continue
      }
      if (status === 0xF0 || status === 0xF7) {
        const sl = readVarLen(buf, pos); pos = sl.end + sl.value; continue
      }

      const type = status & 0xF0, ch = status & 0x0F
      switch (type) {
        case 0x80: { const n=buf[pos++],v=buf[pos++]; events.push({tick,type:'noteOff',channel:ch,note:n,velocity:v,rawBytes:[status,n,v]}); break }
        case 0x90: { const n=buf[pos++],v=buf[pos++]
          if (v===0) events.push({tick,type:'noteOff',channel:ch,note:n,velocity:0,rawBytes:[0x80|ch,n,0x40]})
          else       events.push({tick,type:'noteOn',channel:ch,note:n,velocity:v})
          break }
        case 0xA0: { const n=buf[pos++],v=buf[pos++]; events.push({tick,type:'aftertouch',channel:ch,note:n,pressure:v,rawBytes:[status,n,v]}); break }
        case 0xB0: { const c=buf[pos++],v=buf[pos++]; events.push({tick,type:'cc',channel:ch,controller:c,value:v,rawBytes:[status,c,v]}); break }
        case 0xC0: { const p=buf[pos++]; events.push({tick,type:'pc',channel:ch,program:p,rawBytes:[status,p]}); break }
        case 0xD0: { const p=buf[pos++]; events.push({tick,type:'cp',channel:ch,pressure:p,rawBytes:[status,p]}); break }
        case 0xE0: { const lo=buf[pos++],hi=buf[pos++]; events.push({tick,type:'pb',channel:ch,value:((hi<<7)|lo)-8192,rawBytes:[status,lo,hi]}); break }
        default:   pos += (type < 0xC0 ? 2 : type < 0xE0 ? 1 : 2); break
      }
    }
    tracks.push(events)
    pos = trackEnd
  }
  return { format, timeDivision, numTracks, tracks }
}

function buildTracks(parsed) {
  const result = { ppq: parsed.timeDivision, tracks: [], tempos: [], timeSigs: [] }

  for (let ti = 0; ti < parsed.tracks.length; ti++) {
    const evs = parsed.tracks[ti]
    const pending = new Map()
    const notes = [], otherEvs = []
    let name = ti === 0 ? 'Conductor' : `Track ${ti}`
    let primaryChannel = 0
    let program = 0

    for (const ev of evs) {
      if (ev.type === 'trackName') { name = ev.name; continue }
      if (ev.type === 'tempo')    { result.tempos.push({ tick: ev.tick, tempo: ev.tempo }); continue }
      if (ev.type === 'timeSig')  { result.timeSigs.push({ tick: ev.tick, num: ev.num, den: ev.den }); continue }
      if (ev.type === 'pc') {
        if (ev.tick === 0) program = ev.program   // capture initial patch; skip re-adding at tick 0
        else if (ev.rawBytes) otherEvs.push({ tick: ev.tick, rawBytes: ev.rawBytes })
        continue
      }
      if (ev.type === 'noteOn') {
        pending.set(`${ev.channel}-${ev.note}`, { tick: ev.tick, velocity: ev.velocity, channel: ev.channel })
        primaryChannel = ev.channel
        continue
      }
      if (ev.type === 'noteOff') {
        const key = `${ev.channel}-${ev.note}`, p = pending.get(key)
        if (p) {
          notes.push({ id: ++noteIdSeq, channel: p.channel, note: ev.note, startTick: p.tick, endTick: ev.tick, velocity: p.velocity, selected: false })
          pending.delete(key)
        }
        continue
      }
      if (ev.rawBytes) otherEvs.push({ tick: ev.tick, rawBytes: ev.rawBytes })
    }

    result.tracks.push({
      index: ti, name: name.trim() || `Track ${ti + 1}`,
      channel: primaryChannel,
      program,
      color: TRACK_COLORS[ti % TRACK_COLORS.length],
      muted: false, solo: false,
      notes, events: otherEvs,
    })
  }

  if (result.tempos.length === 0) result.tempos.push({ tick: 0, tempo: 500000 })
  if (result.timeSigs.length === 0) result.timeSigs.push({ tick: 0, num: 4, den: 4 })
  result.tempos.sort((a, b) => a.tick - b.tick)
  result.timeSigs.sort((a, b) => a.tick - b.tick)
  return result
}

// ── MIDI serializer ───────────────────────────────────────────────────────────
function writeVarLen(v) {
  if (v < 0x80) return [v]
  const b = []
  while (v > 0) { b.unshift(v & 0x7F); v >>>= 7 }
  for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80
  return b
}

function buildMidiBytes() {
  const tracks = trackData.value
  const numTracks = tracks.length
  const out = []

  // Header
  out.push(0x4D,0x54,0x68,0x64, 0,0,0,6, 0, numTracks > 1 ? 1 : 0,
    (numTracks>>8)&0xFF, numTracks&0xFF,
    (ppq.value>>8)&0xFF, ppq.value&0xFF)

  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]
    const evList = []

    // Track name
    if (track.name) {
      const nb = [...new TextEncoder().encode(track.name)]
      evList.push({ tick:0, prio:0, bytes:[0xFF,0x03,...writeVarLen(nb.length),...nb] })
    }

    // Tempo & time signature (conductor track = track 0)
    if (ti === 0) {
      for (const tc of tempos.value) {
        const t = Math.round(tc.tempo)
        evList.push({ tick:tc.tick, prio:0, bytes:[0xFF,0x51,0x03,(t>>16)&0xFF,(t>>8)&0xFF,t&0xFF] })
      }
      for (const ts of timeSigs.value) {
        evList.push({ tick:ts.tick, prio:0, bytes:[0xFF,0x58,0x04,ts.num,Math.round(Math.log2(ts.den)),24,8] })
      }
    }

    // Program change (skip channel 9 = GM drums)
    if (track.channel !== 9) {
      const ch = track.channel & 0x0F
      evList.push({ tick: 0, prio: 0, bytes: [0xC0 | ch, (track.program ?? 0) & 0x7F] })
    }

    // Preserved non-note events
    for (const ev of track.events) {
      evList.push({ tick: ev.tick, prio:1, bytes: ev.rawBytes })
    }

    // Notes
    for (const note of track.notes) {
      const ch = note.channel & 0x0F, n = note.note & 0x7F, v = Math.max(1, note.velocity & 0x7F)
      evList.push({ tick: note.startTick, prio:2, bytes:[0x90|ch, n, v] })
      evList.push({ tick: note.endTick,   prio:1, bytes:[0x80|ch, n, 0x40] })
    }

    evList.sort((a,b) => a.tick !== b.tick ? a.tick - b.tick : a.prio - b.prio)

    const trackBytes = []; let lastTick = 0
    for (const ev of evList) {
      const delta = Math.max(0, ev.tick - lastTick)
      trackBytes.push(...writeVarLen(delta), ...ev.bytes)
      lastTick = ev.tick
    }
    trackBytes.push(0, 0xFF, 0x2F, 0x00)

    out.push(0x4D,0x54,0x72,0x6B,
      (trackBytes.length>>24)&0xFF,(trackBytes.length>>16)&0xFF,
      (trackBytes.length>>8)&0xFF,trackBytes.length&0xFF,
      ...trackBytes)
  }

  return new Uint8Array(out)
}

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr  = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const W = rect.width, H = rect.height
  if (!W || !H) return
  if (canvas.width !== Math.round(W*dpr) || canvas.height !== Math.round(H*dpr)) {
    canvas.width  = Math.round(W*dpr)
    canvas.height = Math.round(H*dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.save(); ctx.resetTransform(); ctx.scale(dpr, dpr)

  const noteW = W - KEYS_W
  const noteH = H - RULER_H - VEL_H
  const rh    = rowHeight()
  const ppqV  = ppq.value
  const tsNum = timeSigs.value[0]?.num ?? 4
  const tsDen = timeSigs.value[0]?.den ?? 4
  const beatPx = zoomX.value * BASE_PPB
  const barTicks = ppqV * tsNum * (4 / tsDen)

  // ── Background stripes ──────────────────────────────────────────────────────
  ctx.fillStyle = '#16161e'; ctx.fillRect(KEYS_W, RULER_H, noteW, noteH)
  for (let n = 0; n < 128; n++) {
    const y = RULER_H + noteToY(n) - scrollY.value
    if (y + rh < RULER_H || y > RULER_H + noteH) continue
    if (IS_BLACK[n % 12]) {
      ctx.fillStyle = '#0f0f18'
      ctx.fillRect(KEYS_W, y, noteW, rh - 0.5)
    }
    // C note marker line
    if (n % 12 === 0) {
      ctx.strokeStyle = '#2a2a40'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(KEYS_W, y - 0.25); ctx.lineTo(W, y - 0.25); ctx.stroke()
    }
  }

  // ── Grid lines ──────────────────────────────────────────────────────────────
  const firstTick = pxToTicks(scrollX.value)
  const lastTick  = pxToTicks(scrollX.value + noteW)
  let barN = Math.floor(firstTick / barTicks)
  while (true) {
    const startTick = barN * barTicks
    if (startTick > lastTick) break
    const bx = KEYS_W + ticksToPx(startTick) - scrollX.value
    if (bx >= KEYS_W && bx <= W) {
      ctx.strokeStyle = '#333352'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(bx+0.5,RULER_H); ctx.lineTo(bx+0.5,RULER_H+noteH); ctx.stroke()
    }
    if (beatPx >= 12) {
      for (let b = 1; b < tsNum * (4/tsDen); b++) {
        const bbt = startTick + b * ppqV
        const bbx = KEYS_W + ticksToPx(bbt) - scrollX.value
        if (bbx >= KEYS_W && bbx <= W) {
          ctx.strokeStyle = '#20203a'; ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(bbx+0.5,RULER_H); ctx.lineTo(bbx+0.5,RULER_H+noteH); ctx.stroke()
        }
      }
    }
    if (beatPx >= 60) {
      for (let b = 0; b < tsNum * (4/tsDen); b++) {
        for (let s = 1; s < 4; s++) {
          const st = startTick + b * ppqV + s * ppqV / 4
          const sx = KEYS_W + ticksToPx(st) - scrollX.value
          if (sx >= KEYS_W && sx <= W) {
            ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 0.5
            ctx.beginPath(); ctx.moveTo(sx+0.5,RULER_H); ctx.lineTo(sx+0.5,RULER_H+noteH); ctx.stroke()
          }
        }
      }
    }
    barN++
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  for (let ti = 0; ti < trackData.value.length; ti++) {
    const track = trackData.value[ti]
    if (soloActive.value ? !track.solo : track.muted) continue
    const color = track.color
    for (const note of track.notes) {
      const nx = KEYS_W + ticksToPx(note.startTick) - scrollX.value
      const nw = Math.max(2, ticksToPx(note.endTick - note.startTick) - 1)
      const ny = RULER_H + noteToY(note.note) - scrollY.value
      const nh = rh - 1
      if (nx + nw < KEYS_W || nx > W || ny + nh < RULER_H || ny > RULER_H + noteH) continue
      ctx.fillStyle = note.selected ? '#ffffff' : color
      ctx.globalAlpha = note.selected ? 1 : 0.88
      ctx.fillRect(nx, ny + 1, nw, nh - 1)
      ctx.globalAlpha = 1
      ctx.strokeStyle = note.selected ? '#ffffaa' : adjustColor(color, -40)
      ctx.lineWidth = 1
      ctx.strokeRect(nx + 0.5, ny + 1.5, nw - 1, nh - 2)
      if (nw > 18 && rh >= 9) {
        ctx.fillStyle = note.selected ? '#000' : 'rgba(0,0,0,0.75)'
        ctx.font = `bold ${Math.min(9, rh - 2)}px sans-serif`
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(NOTE_NAMES[note.note % 12], nx + 2, ny + rh / 2)
      }
    }
  }


  // ── Playback cursor ──────────────────────────────────────────────────────────
  const cx = KEYS_W + ticksToPx(currentTick.value) - scrollX.value
  if (cx >= KEYS_W && cx <= W) {
    ctx.strokeStyle = '#ff4455'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, RULER_H - 4); ctx.lineTo(cx, RULER_H + noteH); ctx.stroke()
    ctx.fillStyle = '#ff4455'
    ctx.beginPath(); ctx.moveTo(cx-5,RULER_H-8); ctx.lineTo(cx+5,RULER_H-8); ctx.lineTo(cx,RULER_H-2); ctx.closePath(); ctx.fill()
  }

  // ── Ruler ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c18'; ctx.fillRect(KEYS_W, 0, noteW, RULER_H)
  barN = Math.floor(firstTick / barTicks)
  while (true) {
    const startTick = barN * barTicks
    if (startTick > lastTick) break
    const bx = KEYS_W + ticksToPx(startTick) - scrollX.value
    if (bx >= KEYS_W && bx <= W) {
      ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(bx+0.5,0); ctx.lineTo(bx+0.5,RULER_H); ctx.stroke()
      if (ticksToPx(barTicks) > 24) {
        ctx.fillStyle = '#8888bb'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(String(barN + 1), bx + 3, RULER_H / 2)
      }
    }
    if (beatPx >= 24) {
      for (let b = 1; b < tsNum * (4/tsDen); b++) {
        const bbx = KEYS_W + ticksToPx(startTick + b * ppqV) - scrollX.value
        if (bbx >= KEYS_W && bbx <= W) {
          ctx.strokeStyle = '#28284a'; ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(bbx+0.5,RULER_H*0.6); ctx.lineTo(bbx+0.5,RULER_H); ctx.stroke()
        }
      }
    }
    barN++
  }

  // ── Piano keys ───────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, RULER_H, KEYS_W, noteH)
  for (let n = 127; n >= 0; n--) {
    const ky = RULER_H + noteToY(n) - scrollY.value
    if (ky + rh < RULER_H || ky > RULER_H + noteH) continue
    const isBlack = IS_BLACK[n % 12]
    ctx.fillStyle = isBlack ? '#1e1e30' : '#d0d0e8'
    const kw = isBlack ? KEYS_W * 0.65 : KEYS_W - 1
    ctx.fillRect(1, ky + 0.5, kw - 1, rh - 1)
    if (!isBlack) {
      ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(1, ky+rh-0.5); ctx.lineTo(KEYS_W-1, ky+rh-0.5); ctx.stroke()
    }
    if (n % 12 === 0 && rh >= 7) {
      ctx.fillStyle = '#666690'; ctx.font = `${Math.max(7, Math.min(10, rh-2))}px monospace`
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(`C${Math.floor(n/12)-1}`, KEYS_W - 3, ky + rh/2)
    }
  }
  ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(KEYS_W-0.5,RULER_H); ctx.lineTo(KEYS_W-0.5,RULER_H+noteH); ctx.stroke()

  // ── Velocity lane ─────────────────────────────────────────────────────────────
  const velY = RULER_H + noteH
  ctx.fillStyle = '#0c0c18'; ctx.fillRect(KEYS_W, velY, noteW, VEL_H)
  ctx.strokeStyle = '#2a2a44'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(KEYS_W, velY+0.5); ctx.lineTo(W, velY+0.5); ctx.stroke()
  for (let ti = 0; ti < trackData.value.length; ti++) {
    const track = trackData.value[ti]
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const note of track.notes) {
      const vx = KEYS_W + ticksToPx(note.startTick) - scrollX.value
      if (vx < KEYS_W || vx > W) continue
      const bh = Math.max(2, (note.velocity / 127) * (VEL_H - 6))
      ctx.fillStyle = note.selected ? '#ffffff' : track.color
      ctx.globalAlpha = 0.75
      ctx.fillRect(vx - 1, velY + VEL_H - bh, 3, bh)
    }
  }
  ctx.globalAlpha = 1

  // ── Corners ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, KEYS_W, RULER_H)
  ctx.fillRect(0, velY, KEYS_W, VEL_H)

  ctx.restore()
}

function adjustColor(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16)
  const r = Math.max(0, Math.min(255, (n>>16) + amount))
  const g = Math.max(0, Math.min(255, ((n>>8)&0xFF) + amount))
  const b = Math.max(0, Math.min(255, (n&0xFF) + amount))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}


function markDirty() {
  if (animFrameId || rafDirtyId) return
  rafDirtyId = requestAnimationFrame(() => { rafDirtyId = null; draw() })
}

// ── Animation loop (during playback) ─────────────────────────────────────────
function startAnimation() {
  if (animFrameId) return
  function loop() {
    if (seq) {
      if (seq.isFinished) { stopPlayback(); draw(); return }
      const t = seq.currentHighResolutionTime ?? seq.currentTime ?? 0
      currentTick.value = secondsToTicks(t)
      ensureCursorVisible()
    }
    draw()
    animFrameId = requestAnimationFrame(loop)
  }
  animFrameId = requestAnimationFrame(loop)
}

function stopAnimation() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
}

function ensureCursorVisible() {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const noteW = rect.width - KEYS_W
  const cx = ticksToPx(currentTick.value) - scrollX.value
  const maxSX = Math.max(0, ticksToPx(totalTicks.value) + 200 - noteW)
  if (cx > noteW * 0.75) scrollX.value = Math.min(maxSX, scrollX.value + noteW * 0.25)
  else if (cx < 0) scrollX.value = Math.max(0, ticksToPx(currentTick.value) - 40)
}

// ── Note preview ──────────────────────────────────────────────────────────────
let previewingNote = null
let previewOffTimeout = null
let lastPreviewTime = 0

function previewNote(channel, note, velocity, throttle = false) {
  if (!synth || !sfLoaded.value || playing.value) return
  if (throttle && performance.now() - lastPreviewTime < 80) return
  lastPreviewTime = performance.now()
  try {
    if (previewingNote) synth.noteOff(previewingNote.channel, previewingNote.note)
    if (previewOffTimeout) clearTimeout(previewOffTimeout)
    synth.noteOn(channel, note, velocity)
    previewingNote = { channel, note }
    previewOffTimeout = setTimeout(stopPreview, 800)
  } catch {}
}

function stopPreview() {
  if (previewOffTimeout) { clearTimeout(previewOffTimeout); previewOffTimeout = null }
  if (previewingNote) {
    try { synth.noteOff(previewingNote.channel, previewingNote.note) } catch {}
    previewingNote = null
  }
}

// Ruler right-click: sustain all notes active at a given tick until mouseup
let rulerChordNotes = []

function playChordAtTick(tick) {
  if (!synth || !sfLoaded.value || playing.value) return
  const next = []
  for (const track of trackData.value) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) {
      if (n.startTick <= tick && n.endTick > tick)
        next.push({ channel: n.channel, note: n.note, velocity: n.velocity })
    }
  }
  // Stop notes that dropped out
  const nextSet = new Set(next.map(n => `${n.channel}-${n.note}`))
  for (const { channel, note } of rulerChordNotes)
    if (!nextSet.has(`${channel}-${note}`)) try { synth.noteOff(channel, note) } catch {}
  // Start notes that entered
  const prevSet = new Set(rulerChordNotes.map(n => `${n.channel}-${n.note}`))
  for (const { channel, note, velocity } of next)
    if (!prevSet.has(`${channel}-${note}`)) try { synth.noteOn(channel, note, velocity) } catch {}
  rulerChordNotes = next
}

function stopRulerPreview() {
  if (!synth) return
  for (const { channel, note } of rulerChordNotes)
    try { synth.noteOff(channel, note) } catch {}
  rulerChordNotes = []
}

// ── Mouse interaction ─────────────────────────────────────────────────────────
function canvasCoords(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function inNoteArea(x, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  return !!rect && x >= KEYS_W && y >= RULER_H && y < rect.height - VEL_H
}

function inVelArea(x, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  return !!rect && x >= KEYS_W && y >= rect.height - VEL_H && y < rect.height
}

function noteAtPos(x, y) {
  if (!inNoteArea(x, y)) return null
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const note = yToNote(y - RULER_H + scrollY.value)
  for (const track of trackData.value) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) {
      if (n.note === note && n.startTick <= tick && n.endTick > tick) return { track, note: n }
    }
  }
  return null
}

function noteResizeEdge(x, y) {
  if (!inNoteArea(x, y)) return null
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const note = yToNote(y - RULER_H + scrollY.value)
  const edgeTicks = Math.max(pxToTicks(8), ppq.value / 32)
  for (const track of trackData.value) {
    for (const n of track.notes) {
      if (n.note === note && Math.abs(n.endTick - tick) < edgeTicks && n.startTick < tick)
        return { track, note: n }
    }
  }
  return null
}

function noteAtVelPos(x) {
  let closest = null, closestDist = Infinity
  for (const track of trackData.value) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) {
      const nx = KEYS_W + ticksToPx(n.startTick) - scrollX.value
      const dist = Math.abs(nx - x)
      if (dist < closestDist && dist < 16) { closest = { track, note: n }; closestDist = dist }
    }
  }
  return closest
}

function onMouseDown(e) {
  const { x, y } = canvasCoords(e)

  // Ruler: left drag = seek, right drag = audition chord
  if (y < RULER_H && x >= KEYS_W) {
    const tick = Math.max(0, pxToTicks(x - KEYS_W + scrollX.value))
    currentTick.value = tick
    markDirty()
    if (e.button === 0) {
      if (seq) seq.currentTime = ticksToSeconds(tick)
      drag = { type: 'ruler', button: 0 }
    } else if (e.button === 2) {
      playChordAtTick(tick)
      drag = { type: 'ruler', button: 2 }
    }
    return
  }

  // Velocity lane
  if (inVelArea(x, y)) {
    if (e.button === 0) {
      const hit = noteAtVelPos(x)
      if (hit) {
        previewNote(hit.note.channel, hit.note.note, hit.note.velocity)
        drag = { type: 'velocity', note: hit.note }
      }
    }
    return
  }

  if (!inNoteArea(x, y)) return

  // Right click: delete
  if (e.button === 2) {
    const hit = noteAtPos(x, y)
    if (hit) {
      previewNote(hit.note.channel, hit.note.note, hit.note.velocity)
      removeNote(hit.track, hit.note)
      markDirty()
    }
    drag = { type: 'erase' }
    return
  }

  if (e.button !== 0) return

  // Right-edge resize
  const edge = noteResizeEdge(x, y)
  if (edge) {
    drag = { type: 'resize', startX: x, note: edge.note }
    return
  }

  const hit = noteAtPos(x, y)
  if (hit) {
    // Click existing note: move it
    previewNote(hit.note.channel, hit.note.note, hit.note.velocity)
    drag = { type: 'move', startX: x, startY: y, note: hit.note,
             origStart: hit.note.startTick, origNote: hit.note.note }
  } else {
    // Click empty: create note, then allow moving
    const st = quantizeTick(pxToTicks(x - KEYS_W + scrollX.value))
    const n  = yToNote(y - RULER_H + scrollY.value)
    const at = activeTrack.value < trackData.value.length ? activeTrack.value : 0
    const ch = trackData.value[at]?.channel ?? 0
    const newNote = { id: ++noteIdSeq, channel: ch, note: n, startTick: st,
                      endTick: st + defaultDuration(), velocity: 100, selected: false }
    if (trackData.value[at]) trackData.value[at].notes.push(newNote)
    previewNote(ch, n, 100)
    drag = { type: 'move', startX: x, startY: y, note: newNote, origStart: st, origNote: n }
    markDirty()
  }
}

function onMouseMove(e) {
  const { x, y } = canvasCoords(e)
  if (!drag) { updateCursor(x, y); return }

  if (drag.type === 'ruler') {
    const tick = Math.max(0, pxToTicks(x - KEYS_W + scrollX.value))
    if (currentTick.value !== tick) {
      currentTick.value = tick
      if (drag.button === 0 && seq) seq.currentTime = ticksToSeconds(tick)
      else if (drag.button === 2) playChordAtTick(tick)
      markDirty()
    }
    return
  }

  if (drag.type === 'move') {
    const newTick = Math.max(0, quantizeTick(drag.origStart + pxToTicks(x - drag.startX)))
    const newNote = Math.max(0, Math.min(127, drag.origNote + Math.round((drag.startY - y) / rowHeight())))
    const dur = drag.note.endTick - drag.note.startTick
    if (drag.note.note !== newNote) previewNote(drag.note.channel, newNote, drag.note.velocity, true)
    if (drag.note.startTick !== newTick || drag.note.note !== newNote) {
      drag.note.startTick = newTick
      drag.note.endTick   = newTick + dur
      drag.note.note      = newNote
      markDirty()
    }
  } else if (drag.type === 'resize') {
    const tick = Math.max(drag.note.startTick + ppq.value / 32,
                          quantizeTick(pxToTicks(x - KEYS_W + scrollX.value)))
    if (drag.note.endTick !== tick) { drag.note.endTick = tick; markDirty() }
  } else if (drag.type === 'erase') {
    const hit = noteAtPos(x, y)
    if (hit) { removeNote(hit.track, hit.note); markDirty() }
  } else if (drag.type === 'velocity') {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    const newVel = Math.max(1, Math.min(127, Math.round((rect.height - y) / (VEL_H - 6) * 127)))
    if (drag.note.velocity !== newVel) {
      drag.note.velocity = newVel
      previewNote(drag.note.channel, drag.note.note, newVel, true)
      markDirty()
    }
  }
}

function onMouseUp() {
  stopPreview()
  stopRulerPreview()
  drag = null
}

function onMouseLeave() {
  stopPreview()
  stopRulerPreview()
  if (drag?.type !== 'move' && drag?.type !== 'resize' && drag?.type !== 'ruler') drag = null
}

function onWheel(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const noteH = rect.height - RULER_H - VEL_H
  const noteW = rect.width  - KEYS_W

  if (e.ctrlKey) {
    const oldZoom = zoomX.value
    const factor  = e.deltaY < 0 ? 1.15 : 1/1.15
    zoomX.value   = Math.max(0.1, Math.min(16, oldZoom * factor))
    const tickAtMouse = pxToTicks(x - KEYS_W + scrollX.value)
    scrollX.value = Math.max(0, ticksToPx(tickAtMouse) - (x - KEYS_W))
  } else if (e.shiftKey) {
    const maxSX = Math.max(0, ticksToPx(totalTicks.value) + 200 - noteW)
    scrollX.value = Math.max(0, Math.min(maxSX, scrollX.value + e.deltaY * 0.8))
  } else {
    const maxSY = Math.max(0, 128 * rowHeight() - noteH)
    scrollY.value = Math.max(0, Math.min(maxSY, scrollY.value + e.deltaY * 0.8))
  }
  markDirty()
}

function updateCursor(x, y) {
  if (!canvasRef.value) return
  let cursor = 'default'
  if (inVelArea(x, y)) {
    cursor = noteAtVelPos(x) ? 'ns-resize' : 'default'
  } else if (inNoteArea(x, y)) {
    if (noteResizeEdge(x, y)) cursor = 'ew-resize'
    else if (noteAtPos(x, y)) cursor = 'grab'
    else cursor = 'crosshair'
  } else if (y < RULER_H && x >= KEYS_W) {
    cursor = 'col-resize'
  }
  canvasRef.value.style.cursor = cursor
}

function removeNote(track, note) {
  const i = track.notes.indexOf(note)
  if (i >= 0) track.notes.splice(i, 1)
}

// ── Loading ───────────────────────────────────────────────────────────────────
async function loadMidi() {
  loading.value = true; error.value = null
  try {
    const res = await fetch(midiApi.rawUrl(props.file.path))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    const parsed = parseMidi(buf)
    const built  = buildTracks(parsed)

    ppq.value      = built.ppq
    tempos.value   = built.tempos
    timeSigs.value = built.timeSigs
    trackData.value = built.tracks
    noteIdSeq = 0

    let maxTick = 0
    for (const t of built.tracks) for (const n of t.notes) maxTick = Math.max(maxTick, n.endTick)
    totalTicks.value = maxTick + ppq.value * 8
    loopEnd.value    = maxTick

    currentTick.value = 0
    activeTrack.value = trackData.value.findIndex(t => t.notes.length > 0)
    if (activeTrack.value < 0) activeTrack.value = 0

    await nextTick()
    centerView()
    markDirty()
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}

function centerView() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const noteH = rect.height - RULER_H - VEL_H
  const allNotes = trackData.value.flatMap(t => t.notes)
  if (allNotes.length) {
    const min = Math.min(...allNotes.map(n => n.note))
    const max = Math.max(...allNotes.map(n => n.note))
    const center = (min + max) / 2
    const maxSY = Math.max(0, 128 * rowHeight() - noteH)
    scrollY.value = Math.max(0, Math.min(maxSY, noteToY(center) - noteH / 2))
  } else {
    scrollY.value = Math.max(0, noteToY(60) - noteH / 2)
  }
  scrollX.value = 0
}

// ── SoundFont ─────────────────────────────────────────────────────────────────
async function loadSoundFont() {
  sfLoading.value = true; sfError.value = null
  try {
    const url = sfUrlInput.value.trim()
    if (!url) throw new Error('Please enter a SoundFont URL or path')
    const fetchUrl = url.match(/^https?:\/\//) || url.startsWith('/api/')
      ? url
      : `/api/files/download?path=${encodeURIComponent(url)}`
    const res = await fetch(fetchUrl)
    if (!res.ok) throw new Error(`Failed to fetch SoundFont: ${res.status} ${res.statusText}`)
    const sfBuf = await res.arrayBuffer()

    if (!audioCtx) {
      audioCtx = new AudioContext()
      await audioCtx.audioWorklet.addModule(spessaWorkletUrl)
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume()

    const { WorkletSynthesizer } = await import('spessasynth_lib')
    if (synth) try { synth.disconnect(); synth.destroy?.() } catch {}
    synth = new WorkletSynthesizer(audioCtx)
    if (synth.isReady) await synth.isReady
    synth.connect(audioCtx.destination)
    await synth.soundBankManager.addSoundBank(sfBuf, 'default')

    sfLoaded.value = true
    if (url !== DEFAULT_SF_URL) localStorage.setItem('fv-midi-soundfont', url)
    showSFDialog.value = false
  } catch (e) {
    sfError.value = e.message || String(e)
  } finally {
    sfLoading.value = false
  }
}

// ── Playback ──────────────────────────────────────────────────────────────────
async function togglePlay() {
  if (!sfLoaded.value) { showSFDialog.value = true; return }
  playing.value ? pausePlayback() : await startPlayback()
}

async function startPlayback() {
  try {
    if (audioCtx?.state === 'suspended') await audioCtx.resume()
    const midiBytes = buildMidiBytes()
    const { Sequencer } = await import('spessasynth_lib')
    if (seq) try { seq.pause() } catch {}
    seq = new Sequencer(synth)
    seq.loadNewSongList([{ binary: midiBytes.buffer }])
    const startSec = ticksToSeconds(currentTick.value)
    // Wait for song to load, then seek and play
    seq.eventHandler.addEvent('songChange', 'play-on-load', () => {
      seq.eventHandler.removeEvent('songChange', 'play-on-load')
      if (startSec > 0) seq.currentTime = startSec
      seq.loopCount = looping.value ? -1 : 0
      seq.play()
      playing.value = true
      startAnimation()
    })
  } catch (e) {
    error.value = `Playback failed: ${e.message}`
    playing.value = false
  }
}

function pausePlayback() {
  if (seq) try { seq.pause() } catch {}
  playing.value = false
  stopAnimation()
  draw()
}

function stopPlayback() {
  if (seq) { try { seq.pause(); seq.currentTime = 0 } catch {} }
  playing.value = false
  currentTick.value = 0
  stopAnimation()
  draw()
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function saveMidi() {
  saving.value = true
  try {
    const bytes = buildMidiBytes()
    const b64   = bytesToBase64(bytes)
    await midiApi.save(props.file.path, b64)
  } catch (e) {
    error.value = `Save failed: ${e.message}`
  } finally {
    saving.value = false
  }
}

function bytesToBase64(bytes) {
  let s = ''; const chunk = 4096
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

function setBpm(val) {
  const bpmVal = Number(val)
  if (!isFinite(bpmVal) || bpmVal < 1) return
  const tempo = Math.round(60000000 / bpmVal)
  if (tempos.value.length && tempos.value[0].tick === 0) tempos.value[0].tempo = tempo
  else tempos.value.unshift({ tick: 0, tempo })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let ro = null

function changeProgram(track, program) {
  track.program = program
  if (synth && sfLoaded.value) {
    try { synth.programChange(track.channel, program) } catch {}
  }
}

function onKey({ key, raw }) {
  if (key === ' ') { raw.preventDefault(); togglePlay() }
}

onMounted(async () => {
  await nextTick()
  ro = new ResizeObserver(markDirty)
  if (rollRef.value) ro.observe(rollRef.value)
  eventBus?.on('keyboard:keydown', onKey)
  await loadMidi()
  loadSoundFont()
})

onUnmounted(() => {
  eventBus?.off('keyboard:keydown', onKey)
  ro?.disconnect()
  stopPreview()
  stopRulerPreview()
  stopAnimation()
  if (rafDirtyId) cancelAnimationFrame(rafDirtyId)
  if (seq) try { seq.pause(); seq.currentTime = 0 } catch {}
  if (audioCtx) try { audioCtx.close() } catch {}
})

watch(() => props.file, async (f) => {
  stopPlayback()
  if (f) { props.winManager?.setTitle(props.winId, f.name); await loadMidi() }
})
</script>

<template>
  <div class="midi-editor">
    <!-- Loading / Error overlays -->
    <div v-if="loading" class="overlay">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else-if="error" class="overlay error-overlay">
      <v-icon size="48" color="error">mdi-alert-circle-outline</v-icon>
      <div class="text-body-1 mt-2">{{ error }}</div>
    </div>

    <template v-else>
      <!-- ── Top bar ───────────────────────────────────────────────────────── -->
      <div class="top-bar">
        <!-- Transport -->
        <v-btn-group density="compact" variant="outlined">
          <v-btn size="small" icon="mdi-skip-backward" @click="stopPlayback" />
          <v-btn size="small" :icon="playing ? 'mdi-pause' : 'mdi-play'"
            :color="playing ? 'primary' : undefined" @click="togglePlay" />
          <v-btn size="small" icon="mdi-repeat" :color="looping ? 'primary' : undefined"
            @click="looping = !looping" />
        </v-btn-group>

        <div class="pos-display font-mono">{{ positionDisplay }}</div>

        <v-text-field
          :model-value="currentBpm" @change="setBpm"
          hide-details density="compact" variant="outlined"
          type="number" min="20" max="300" suffix="BPM"
          style="width:100px;flex-shrink:0"
        />

        <!-- Quantize -->
        <v-select v-model="quantize" :items="QUANTIZE_OPTS"
          hide-details density="compact" variant="outlined" style="width:82px;flex-shrink:0" />

        <!-- Zoom -->
        <v-btn size="small" icon density="compact" @click="zoomX = Math.max(0.1, +(zoomX-0.25).toFixed(2))">
          <v-icon size="14">mdi-magnify-minus-outline</v-icon>
        </v-btn>
        <span class="zoom-label">{{ Math.round(zoomX * 100) }}%</span>
        <v-btn size="small" icon density="compact" @click="zoomX = Math.min(16, +(zoomX+0.25).toFixed(2))">
          <v-icon size="14">mdi-magnify-plus-outline</v-icon>
        </v-btn>

        <div style="flex:1" />

        <v-btn size="small" :color="sfLoaded ? 'success' : 'warning'" variant="tonal"
          prepend-icon="mdi-music" @click="showSFDialog = true">
          {{ sfLoaded ? 'SoundFont ✓' : 'Load SoundFont' }}
        </v-btn>

        <v-btn size="small" prepend-icon="mdi-content-save" variant="tonal"
          :loading="saving" @click="saveMidi">Save</v-btn>
      </div>

      <!-- ── Body ─────────────────────────────────────────────────────────── -->
      <div class="editor-body">
        <!-- Track list -->
        <div class="track-list">
          <div class="tl-header text-caption px-2">
            Tracks ({{ trackData.length }})
          </div>
          <div
            v-for="track in trackData" :key="track.index"
            class="tl-row" :class="{ 'tl-row--active': activeTrack === track.index }"
            @click="activeTrack = track.index"
          >
            <div class="tl-color" :style="{background: track.color}" />
            <div class="tl-info">
              <div class="tl-name">{{ track.name }}</div>
              <v-select
                v-if="track.channel !== 9"
                :model-value="track.program ?? 0"
                :items="GM_ITEMS"
                hide-details density="compact" variant="plain"
                class="tl-program"
                @update:model-value="changeProgram(track, $event)"
                @click.stop
              />
              <div v-else class="tl-drum-label">Drums</div>
            </div>
            <v-btn density="compact" :icon="track.muted ? 'mdi-volume-off' : 'mdi-volume-high'"
              size="x-small" variant="text"
              :color="track.muted ? 'error' : undefined"
              @click.stop="track.muted = !track.muted; markDirty()" />
            <v-btn density="compact" icon="mdi-star" size="x-small" variant="text"
              :color="track.solo ? 'warning' : undefined"
              @click.stop="track.solo = !track.solo; markDirty()" />
          </div>
        </div>

        <!-- Piano roll canvas -->
        <div class="piano-roll" ref="rollRef">
          <canvas ref="canvasRef" class="roll-canvas"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @contextmenu.prevent
            @wheel.prevent="onWheel"
          />
        </div>
      </div>
    </template>

    <!-- SoundFont dialog -->
    <v-dialog v-model="showSFDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6">SoundFont Configuration</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Enter a URL or file path to a SoundFont (.sf2) file for MIDI playback.
          </p>
          <v-text-field
            v-model="sfUrlInput"
            label="SoundFont URL or path"
            placeholder="https://... or /path/to/soundfont.sf2"
            variant="outlined" hide-details
          />
          <div v-if="sfError" class="text-error text-body-2 mt-2">{{ sfError }}</div>
          <v-alert type="info" variant="tonal" density="compact" class="mt-3 text-caption">
            Free SoundFonts: download GeneralUser GS or MuseScore_General.sf3 and specify the path.
            Scroll: wheel · Pan X: Shift+wheel · Zoom: Ctrl+wheel
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showSFDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :loading="sfLoading" @click="loadSoundFont">
            Load SoundFont
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.midi-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111a;
  color: #c0c0d8;
  overflow: hidden;
  position: relative;
}

.overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(17,17,26,0.85);
  z-index: 10;
}
.error-overlay { color: #ff6677; }

/* ── Top bar ────────────────────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #0d0d18;
  border-bottom: 1px solid #2a2a40;
  flex-shrink: 0;
  height: 48px;
  overflow: hidden;
}

.pos-display {
  font-family: monospace;
  font-size: 13px;
  background: #0a0a12;
  border: 1px solid #2a2a40;
  border-radius: 4px;
  padding: 2px 8px;
  min-width: 90px;
  text-align: center;
  color: #88aaff;
  flex-shrink: 0;
}

.zoom-label {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
  opacity: 0.7;
}

/* ── Body ───────────────────────────────────────────────────── */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Track list ─────────────────────────────────────────────── */
.track-list {
  width: 168px;
  flex-shrink: 0;
  background: #0d0d18;
  border-right: 1px solid #2a2a40;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.tl-header {
  padding: 6px 8px 4px;
  color: #666688;
  border-bottom: 1px solid #1e1e30;
  flex-shrink: 0;
}

.tl-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid #1a1a28;
  cursor: pointer;
  transition: background 0.12s;
  min-height: 48px;
}
.tl-row:hover { background: #16162a; }
.tl-row--active { background: #1c1c34; }

.tl-color {
  width: 4px;
  height: 32px;
  border-radius: 2px;
  flex-shrink: 0;
}

.tl-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.tl-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #b0b0cc;
  line-height: 1.3;
}

.tl-program {
  font-size: 10px !important;
  margin-top: 1px;
}

.tl-program :deep(.v-field__input) {
  font-size: 10px !important;
  padding: 0 !important;
  min-height: unset !important;
}

.tl-program :deep(.v-field) {
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
}

.tl-drum-label {
  font-size: 10px;
  color: #666688;
  margin-top: 2px;
}

/* ── Piano roll ─────────────────────────────────────────────── */
.piano-roll {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.roll-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
</style>
