<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject, nextTick } from 'vue'
import { useTheme } from 'vuetify'
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

const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

const colors = computed(() => isDark.value ? {
  bgBlack:      'rgba(0,0,0,0.30)',
  bgDark:       'rgba(0,0,0,0.22)', bgDarker:     'rgba(0,0,0,0.35)',
  gridQ:        '#1e1e36', gridBeat:     '#20203a', gridBar:     '#333352',
  border:       '#2a2a40', borderHard:   '#3a3a5a',
  cursor:       '#ff4455',
  pianoBlack:   '#1e1e30', pianoWhite:   '#d0d0e8', pianoText:   '#666690',
  rulerBeat:    '#28284a', rulerBar:     '#3a3a5a',
  textDim:      '#8888bb', textGreen:    '#66cc99',
  velBorder:    '#2a2a44',
  bpmRefLine:   '#252535', bpmRefText:   '#3a3a55',
  bpmLine:      '#f472b6', bpmDotFirst:  '#ff88aa',
  bpmDotStroke: '#ffaabb', bpmText:      '#ddaacc',
  pcText:       '#bbccee', pcDotFirst:   '#aaddff',
} : {
  bgBlack:      'rgba(0,0,0,0.065)',
  bgDark:       'rgba(0,0,0,0.045)', bgDarker:     'rgba(0,0,0,0.08)',
  gridQ:        '#d8d8ec', gridBeat:     '#ccccdd', gridBar:     '#aaaac0',
  border:       '#c8c8dc', borderHard:   '#9090aa',
  cursor:       '#dd2233',
  pianoBlack:   '#5a5a7a', pianoWhite:   '#f8f8ff', pianoText:   '#7070a0',
  rulerBeat:    '#c8c8d8', rulerBar:     '#9090aa',
  textDim:      '#7070a0', textGreen:    '#1a8a55',
  velBorder:    '#c0c0d8',
  bpmRefLine:   '#d8d8e8', bpmRefText:   '#9090aa',
  bpmLine:      '#cc44aa', bpmDotFirst:  '#ee66aa',
  bpmDotStroke: '#dd88aa', bpmText:      '#aa3388',
  pcText:       '#445588', pcDotFirst:   '#3366cc',
})

// ── Constants ─────────────────────────────────────────────────────────────────
const KEYS_W  = 72
const RULER_H = 32
const VEL_H_DEFAULT = 80
const NOTE_H  = 9
const BASE_PPB = 120

const IS_BLACK = [false,true,false,true,false,false,true,false,true,false,true,false]
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const TRACK_COLORS = ['#4ade80','#60a5fa','#f87171','#fb923c','#a78bfa','#34d399','#f472b6','#facc15','#22d3ee','#e879f9']
const QUANTIZE_OPTS = computed(() => [
  { title: t('midi.quantizeOff'), value: null  },
  { title: '1/4',   value: 1     },
  { title: '1/8',   value: 1/2   },
  { title: '1/16',  value: 1/4   },
  { title: '1/32',  value: 1/8   },
  { title: '1/4T',  value: 2/3   },
  { title: '1/8T',  value: 1/3   },
  { title: '1/16T', value: 1/6   },
  { title: '1/4×5', value: 4/5   },
  { title: '1/8×5', value: 2/5   },
  { title: '1/16×5',value: 1/5   },
])
const BPM_MIN = 20, BPM_MAX = 320
const CC_NAMES = {
  0:'Bank Select', 1:'Modulation', 2:'Breath', 4:'Foot', 7:'Volume',
  10:'Pan', 11:'Expression', 64:'Sustain', 65:'Portamento',
  71:'Resonance', 72:'Release', 73:'Attack', 74:'Filter Cutoff',
  91:'Reverb', 93:'Chorus',
}
const CC_ITEMS = Array.from({length:128}, (_,i) => ({
  value: i,
  title: CC_NAMES[i] ? `${i}: ${CC_NAMES[i]}` : `CC ${i}`,
}))
const CHANNEL_ITEMS = computed(() => Array.from({length:16}, (_,i) => ({
  value: i,
  title: i === 9 ? t('midi.channel10') : t('midi.channelN', { n: i + 1 }),
})))

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

const GM_DRUM_KITS = {
  0:'Standard Kit', 8:'Room Kit', 16:'Power Kit', 24:'Electronic Kit',
  25:'TR-808 Kit', 32:'Jazz Kit', 40:'Brush Kit', 48:'Orchestra Kit', 56:'Sound FX Kit',
}
const GM_DRUM_ITEMS = Array.from({length: 128}, (_, i) => ({
  title: `${i}. ${GM_DRUM_KITS[i] ?? `Kit ${i}`}`,
  value: i,
}))

// ── State ─────────────────────────────────────────────────────────────────────
const loading   = ref(true)
const error     = ref(null)
const saving    = ref(false)

const ppq       = ref(480)
const tempos    = ref([{ tick: 0, tempo: 500000 }])
const timeSigs  = ref([{ tick: 0, num: 4, den: 4 }])
const trackData = ref([])
const totalTicks = ref(0)

const playing      = ref(false)
const currentTick  = ref(0)
const trackLoudness = ref({})
const looping     = ref(false)
const loopStart   = ref(0)
const loopEnd     = ref(0)

const sfLoaded   = ref(false)
const sfLoading  = ref(false)
const sfError    = ref(null)
const DEFAULT_SF_URL = '/api/midi/soundfont/default'
const sfUrlInput = ref(localStorage.getItem('fv-midi-soundfont') || DEFAULT_SF_URL)
const showSFDialog = ref(false)

const quantize   = ref(1/4)
const activeTrack = ref(0)
const zoomX      = ref(1.0)
const zoomY      = ref(1.0)
const scrollX    = ref(0)
const scrollY    = ref(0)

// Lane mode
const laneMode = ref('velocity')  // 'velocity' | 'cc' | 'bpm' | 'pc'
const ccNumber = ref(7)

const canvasRef    = ref(null)
const rollRef      = ref(null)
const tsNumInputRef = ref(null)

// TS popup
const tsDialog  = ref(null)   // { x, y, tick, isNew }
const tsEditNum = ref(4)
const tsEditDen = ref(4)

let audioCtx = null
let synth    = null
let seq      = null

let animFrameId  = null
let rafDirtyId   = null
let loudnessDecay = {}

let drag = null
let uiDrag = null
let noteIdSeq = 0

const trackListWidth    = ref(188)
const bottomLaneHeight  = ref(VEL_H_DEFAULT)

// ── Clipboard ─────────────────────────────────────────────────────────────────
let clipboard = { minTick: 0, notes: [] }

// ── Undo / Redo ───────────────────────────────────────────────────────────────
const MAX_UNDO = 100
const _undoStack = []
const _redoStack = []
const undoVersion = ref(0)

const canUndo = computed(() => { undoVersion.value; return _undoStack.length > 0 })
const canRedo = computed(() => { undoVersion.value; return _redoStack.length > 0 })

function snapshotState() {
  return {
    trackData: trackData.value.map(t => ({
      ...t,
      notes:    t.notes.map(n => ({ ...n })),
      events:   [...t.events],
      ccEvents: t.ccEvents.map(e => ({ ...e })),
      pcEvents: t.pcEvents.map(e => ({ ...e })),
    })),
    tempos:   tempos.value.map(t => ({ ...t })),
    timeSigs: timeSigs.value.map(t => ({ ...t })),
  }
}

function pushUndo() {
  _undoStack.push(snapshotState())
  if (_undoStack.length > MAX_UNDO) _undoStack.shift()
  _redoStack.length = 0
  undoVersion.value++
}

function restoreSnapshot(snap) {
  trackData.value = snap.trackData
  tempos.value    = snap.tempos
  timeSigs.value  = snap.timeSigs
  let maxId = noteIdSeq
  for (const t of snap.trackData) for (const n of t.notes) if (n.id > maxId) maxId = n.id
  noteIdSeq = maxId
  let maxTick = 0
  for (const t of snap.trackData) for (const n of t.notes) if (n.endTick > maxTick) maxTick = n.endTick
  if (maxTick > 0) totalTicks.value = maxTick + ppq.value * 8
  undoVersion.value++
  markDirty()
}

function undo() {
  if (!_undoStack.length) return
  _redoStack.push(snapshotState())
  restoreSnapshot(_undoStack.pop())
}

function redo() {
  if (!_redoStack.length) return
  _undoStack.push(snapshotState())
  restoreSnapshot(_redoStack.pop())
}


// ── Computed ──────────────────────────────────────────────────────────────────
const soloActive = computed(() => trackData.value.some(t => t.solo))

const ccItemsSorted = computed(() => {
  const track = trackData.value[activeTrack.value]
  const counts = new Map()
  if (track) {
    for (const ev of (track.ccEvents || [])) {
      counts.set(ev.controller, (counts.get(ev.controller) || 0) + 1)
    }
  }
  const withEvents = []
  const withoutEvents = []
  for (let i = 0; i < 128; i++) {
    const count = counts.get(i) || 0
    const baseName = CC_NAMES[i] ? `CC ${i}: ${CC_NAMES[i]}` : `CC ${i}`
    const item = { value: i, title: baseName, inUse: count > 0, count }
    if (count > 0) withEvents.push(item)
    else withoutEvents.push(item)
  }
  withEvents.sort((a, b) => b.count - a.count)
  if (withEvents.length === 0) return withoutEvents
  return [...withEvents, { type: 'divider' }, ...withoutEvents]
})

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
function ticksToPx(ticks) { return ticks * zoomX.value * BASE_PPB / ppq.value }
function pxToTicks(px) { return Math.round(px * ppq.value / (zoomX.value * BASE_PPB)) }
function rowHeight() { return NOTE_H * zoomY.value }
function noteToY(note) { return (127 - note) * rowHeight() }
function yToNote(y) { return Math.max(0, Math.min(127, 127 - Math.floor(y / rowHeight()))) }

function gridTicks() {
  return quantize.value != null ? Math.max(1, Math.round(ppq.value * quantize.value)) : 0
}
function quantizeTick(tick) {
  const q = gridTicks()
  return q > 0 ? Math.round(tick / q) * q : tick
}
function defaultDuration() {
  const q = gridTicks()
  return Math.max(1, q > 0 ? q : Math.round(ppq.value / 4))
}

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

// ── Lane Y helpers ─────────────────────────────────────────────────────────────
function bpmToLaneY(bpm, laneH) {
  return 2 + (1 - (bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * (laneH - 4)
}
function laneYToBpm(y, laneH) {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(
    BPM_MIN + (1 - (y - 2) / (laneH - 4)) * (BPM_MAX - BPM_MIN)
  )))
}
function laneYToCcVal(y, laneH) {
  return Math.max(0, Math.min(127, Math.round(127 * (1 - (y - 2) / (laneH - 4)))))
}
function laneYToPcProg(y, laneH) {
  return Math.max(0, Math.min(127, Math.round(127 * (1 - (y - 2) / (laneH - 4)))))
}
function trackProgramAt(track, tick) {
  let prog = track.program ?? 0
  for (const ev of (track.pcEvents || [])) {
    if (ev.tick <= tick) prog = ev.program
    else break
  }
  return prog
}

// ── MIDI parser ───────────────────────────────────────────────────────────────
function decodeMidiText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {}
  for (const enc of ['shift-jis', 'gbk', 'big5', 'euc-kr', 'windows-1252']) {
    try { return new TextDecoder(enc, { fatal: true }).decode(bytes) } catch {}
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function readVarLen(buf, pos) {
  let val = 0, b
  do { b = buf[pos++]; val = (val << 7) | (b & 0x7F) } while (b & 0x80)
  return { value: val, end: pos }
}

function parseMidi(buffer) {
  const buf = new Uint8Array(buffer)
  if (buf[0] !== 0x4D || buf[1] !== 0x54 || buf[2] !== 0x68 || buf[3] !== 0x64)
    throw new Error(t('midi.errors.invalidMidiFile'))
  let pos = 4
  const headerLen = (buf[pos]<<24|buf[pos+1]<<16|buf[pos+2]<<8|buf[pos+3])>>>0; pos+=4
  const format    = (buf[pos]<<8)|buf[pos+1]; pos+=2
  const numTracks = (buf[pos]<<8)|buf[pos+1]; pos+=2
  const timeDivision = (buf[pos]<<8)|buf[pos+1]; pos+=2
  if (timeDivision & 0x8000) throw new Error(t('midi.errors.smpteNotSupported'))
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
        else if (mt === 0x03) events.push({ tick, type:'trackName', name: decodeMidiText(md) })
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

    // Per-channel collections
    const channelNotes    = new Map()  // channel -> note[]
    const channelCcEvents = new Map()  // channel -> ccEvent[]
    const channelPcEvents = new Map()  // channel -> pcEvent[]
    const channelProgram  = new Map()  // channel -> initial program number
    const channelOtherEvs = new Map()  // channel (or -1) -> rawBytes event[]

    let name = ti === 0 ? t('midi.conductor') : t('midi.trackN', { n: ti })

    for (const ev of evs) {
      if (ev.type === 'trackName') { name = ev.name; continue }
      if (ev.type === 'tempo')    { result.tempos.push({ tick: ev.tick, tempo: ev.tempo }); continue }
      if (ev.type === 'timeSig')  { result.timeSigs.push({ tick: ev.tick, num: ev.num, den: ev.den }); continue }
      if (ev.type === 'pc') {
        const ch = ev.channel
        if (ev.tick === 0) channelProgram.set(ch, ev.program)
        else {
          if (!channelPcEvents.has(ch)) channelPcEvents.set(ch, [])
          channelPcEvents.get(ch).push({ tick: ev.tick, program: ev.program })
        }
        continue
      }
      if (ev.type === 'noteOn') {
        pending.set(`${ev.channel}-${ev.note}`, { tick: ev.tick, velocity: ev.velocity, channel: ev.channel })
        continue
      }
      if (ev.type === 'noteOff') {
        const key = `${ev.channel}-${ev.note}`, p = pending.get(key)
        if (p) {
          const ch = p.channel
          if (!channelNotes.has(ch)) channelNotes.set(ch, [])
          channelNotes.get(ch).push({ id: ++noteIdSeq, channel: ch, note: ev.note, startTick: p.tick, endTick: ev.tick, velocity: p.velocity, selected: false })
          pending.delete(key)
        }
        continue
      }
      if (ev.type === 'cc') {
        const ch = ev.channel
        if (!channelCcEvents.has(ch)) channelCcEvents.set(ch, [])
        channelCcEvents.get(ch).push({ tick: ev.tick, controller: ev.controller, value: ev.value })
        continue
      }
      if (ev.rawBytes) {
        // aftertouch / channel-pressure / pitch-bend all carry a channel
        const ch = ev.channel ?? -1
        if (!channelOtherEvs.has(ch)) channelOtherEvs.set(ch, [])
        channelOtherEvs.get(ch).push({ tick: ev.tick, rawBytes: ev.rawBytes })
      }
    }

    // Collect every channel that appears in this MIDI track
    const allChannels = new Set([
      ...channelNotes.keys(), ...channelCcEvents.keys(),
      ...channelPcEvents.keys(), ...channelProgram.keys(),
      ...[...channelOtherEvs.keys()].filter(c => c !== -1),
    ])
    const globalOtherEvs = channelOtherEvs.get(-1) || []

    if (allChannels.size === 0) {
      // Meta-only / conductor track — keep as a single empty track
      const idx = result.tracks.length
      result.tracks.push({
        index: idx, name: name.trim() || `Track ${ti + 1}`,
        channel: 0, program: 0,
        color: TRACK_COLORS[idx % TRACK_COLORS.length],
        muted: false, solo: false,
        notes: [], events: globalOtherEvs, ccEvents: [], pcEvents: [],
      })
    } else {
      // One editor-track per channel found in this MIDI track
      const sortedChannels = [...allChannels].sort((a, b) => a - b)
      const multi = sortedChannels.length > 1
      const baseName = name.trim() || `Track ${ti + 1}`
      for (let ci = 0; ci < sortedChannels.length; ci++) {
        const ch = sortedChannels[ci]
        const trackName = multi ? `${baseName} Ch.${ch + 1}` : baseName
        const notes  = channelNotes.get(ch) || []
        const ccEvs  = (channelCcEvents.get(ch) || []).sort((a, b) => a.tick - b.tick)
        const pcEvs  = (channelPcEvents.get(ch) || []).sort((a, b) => a.tick - b.tick)
        // Unassigned raw events go into the first channel's track
        const otherEvs = [...(channelOtherEvs.get(ch) || []), ...(ci === 0 ? globalOtherEvs : [])]
        const idx = result.tracks.length
        result.tracks.push({
          index: idx, name: trackName,
          channel: ch, program: channelProgram.get(ch) ?? 0,
          color: TRACK_COLORS[idx % TRACK_COLORS.length],
          muted: false, solo: false,
          notes, events: otherEvs, ccEvents: ccEvs, pcEvents: pcEvs,
        })
      }
    }
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

  out.push(0x4D,0x54,0x68,0x64, 0,0,0,6, 0, numTracks > 1 ? 1 : 0,
    (numTracks>>8)&0xFF, numTracks&0xFF,
    (ppq.value>>8)&0xFF, ppq.value&0xFF)

  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]
    const evList = []

    if (track.name) {
      const nb = [...new TextEncoder().encode(track.name)]
      evList.push({ tick:0, prio:0, bytes:[0xFF,0x03,...writeVarLen(nb.length),...nb] })
    }

    if (ti === 0) {
      for (const tc of tempos.value) {
        const t = Math.round(tc.tempo)
        evList.push({ tick:tc.tick, prio:0, bytes:[0xFF,0x51,0x03,(t>>16)&0xFF,(t>>8)&0xFF,t&0xFF] })
      }
      for (const ts of timeSigs.value) {
        evList.push({ tick:ts.tick, prio:0, bytes:[0xFF,0x58,0x04,ts.num,Math.round(Math.log2(ts.den)),24,8] })
      }
    }

    {
      const ch = track.channel & 0x0F
      evList.push({ tick: 0, prio: 0, bytes: [0xC0 | ch, (track.program ?? 0) & 0x7F] })
    }

    for (const ev of track.events) {
      evList.push({ tick: ev.tick, prio:1, bytes: ev.rawBytes })
    }

    // CC events
    const ch = track.channel & 0x0F
    for (const ev of (track.ccEvents || [])) {
      evList.push({ tick: ev.tick, prio:1, bytes: [0xB0|ch, ev.controller & 0x7F, ev.value & 0x7F] })
    }
    // PC events (tick > 0)
    for (const ev of (track.pcEvents || [])) {
      evList.push({ tick: ev.tick, prio:0, bytes: [0xC0|ch, ev.program & 0x7F] })
    }

    for (const note of track.notes) {
      const nch = note.channel & 0x0F, n = note.note & 0x7F, v = Math.max(1, note.velocity & 0x7F)
      evList.push({ tick: note.startTick, prio:2, bytes:[0x90|nch, n, v] })
      evList.push({ tick: note.endTick,   prio:1, bytes:[0x80|nch, n, 0x40] })
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

// ── Bar iterator ───────────────────────────────────────────────────────────────
// Calls cb({tick, barNum, num, den, barTicks}) for each bar start in [firstTick, lastTick].
// Handles multiple time signature changes. Includes one bar before firstTick for edge rendering.
function forEachBar(firstTick, lastTick, ppqV, cb) {
  const tsList = [...timeSigs.value].sort((a, b) => a.tick - b.tick)
  if (!tsList.length) tsList.push({ tick: 0, num: 4, den: 4 })
  let globalBarNum = 1
  for (let si = 0; si < tsList.length; si++) {
    const ts        = tsList[si]
    const segStart  = ts.tick
    const nextStart = si + 1 < tsList.length ? tsList[si + 1].tick : Infinity
    const barTicks  = ppqV * ts.num * (4 / ts.den)
    if (nextStart !== Infinity && nextStart <= firstTick) {
      globalBarNum += Math.ceil((nextStart - segStart) / barTicks)
      continue
    }
    const skip = firstTick > segStart
      ? Math.max(0, Math.floor((firstTick - segStart) / barTicks) - 1)
      : 0
    let bt = segStart + skip * barTicks
    let bn = globalBarNum + skip
    while (bt <= lastTick) {
      if (nextStart !== Infinity && bt >= nextStart) break
      cb({ tick: bt, barNum: bn, num: ts.num, den: ts.den, barTicks })
      bt += barTicks
      bn++
    }
    if (nextStart !== Infinity)
      globalBarNum += Math.ceil((nextStart - segStart) / barTicks)
  }
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
  ctx.clearRect(0, 0, W, H)

  const C = colors.value
  const primaryRgb = getComputedStyle(canvas).getPropertyValue('--v-theme-primary').trim() || '136,187,255'
  const pianoActive = `rgb(${primaryRgb})`

  const VEL_H  = bottomLaneHeight.value
  const noteW  = W - KEYS_W
  const noteH  = H - RULER_H - VEL_H
  const rh     = rowHeight()
  const ppqV   = ppq.value
  const beatPx = zoomX.value * BASE_PPB

  // ── Background stripes ──────────────────────────────────────────────────────
  for (let n = 0; n < 128; n++) {
    const y = RULER_H + noteToY(n) - scrollY.value
    if (y + rh < RULER_H || y > RULER_H + noteH) continue
    if (IS_BLACK[n % 12]) {
      ctx.fillStyle = C.bgBlack
      ctx.fillRect(KEYS_W, y, noteW, rh - 0.5)
    }
    if (n % 12 === 0) {
      ctx.strokeStyle = C.border; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(KEYS_W, y - 0.25); ctx.lineTo(W, y - 0.25); ctx.stroke()
    }
  }

  // ── Grid lines ──────────────────────────────────────────────────────────────
  const firstTick = pxToTicks(scrollX.value)
  const lastTick  = pxToTicks(scrollX.value + noteW)

  // Quantize grid (faintest layer)
  const q   = gridTicks()
  const qPx = q > 0 ? ticksToPx(q) : 0
  if (q > 0 && qPx >= 3) {
    ctx.strokeStyle = C.gridQ; ctx.lineWidth = 0.5
    const firstQ = Math.floor(firstTick / q) * q
    for (let qt = firstQ; qt <= lastTick; qt += q) {
      const qx = KEYS_W + ticksToPx(qt) - scrollX.value
      if (qx <= KEYS_W || qx > W) continue
      ctx.beginPath(); ctx.moveTo(qx + 0.5, RULER_H); ctx.lineTo(qx + 0.5, RULER_H + noteH); ctx.stroke()
    }
  }

  // Beat lines then bar lines (overwrite quantize lines with stronger strokes)
  forEachBar(firstTick, lastTick, ppqV, ({ tick: barTick, barTicks, num, den }) => {
    if (beatPx >= 12) {
      const beats = num * (4 / den)
      for (let b = 1; b < beats; b++) {
        const bbx = KEYS_W + ticksToPx(barTick + b * ppqV) - scrollX.value
        if (bbx > KEYS_W && bbx <= W) {
          ctx.strokeStyle = C.gridBeat; ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(bbx + 0.5, RULER_H); ctx.lineTo(bbx + 0.5, RULER_H + noteH); ctx.stroke()
        }
      }
    }
    const bx = KEYS_W + ticksToPx(barTick) - scrollX.value
    if (bx >= KEYS_W && bx <= W) {
      ctx.strokeStyle = C.gridBar; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(bx + 0.5, RULER_H); ctx.lineTo(bx + 0.5, RULER_H + noteH); ctx.stroke()
    }
  })

  // ── Notes ───────────────────────────────────────────────────────────────────
  // Draw non-active tracks first, active track last so its notes render on top
  const trackOrder = [
    ...trackData.value.filter(t => t.index !== activeTrack.value),
    ...trackData.value.filter(t => t.index === activeTrack.value),
  ]
  for (const track of trackOrder) {
    if (soloActive.value ? !track.solo : track.muted) continue
    const color = track.color
    for (const note of track.notes) {
      const nx = KEYS_W + ticksToPx(note.startTick) - scrollX.value
      const nw = Math.max(2, ticksToPx(note.endTick - note.startTick) - 1)
      const ny = RULER_H + noteToY(note.note) - scrollY.value
      const nh = rh - 1
      if (nx + nw < KEYS_W || nx > W || ny + nh < RULER_H || ny > RULER_H + noteH) continue
      const isActive = (playing.value || (drag?.type === 'ruler' && drag?.button === 2)) &&
        note.startTick <= currentTick.value && note.endTick > currentTick.value
      ctx.fillStyle = note.selected ? '#ffffff' : (isActive ? adjustColor(color, 80) : color)
      ctx.globalAlpha = note.selected ? 1 : (isActive ? 1 : 0.88)
      ctx.fillRect(nx, ny + 1, nw, nh - 1)
      ctx.globalAlpha = 1
      ctx.strokeStyle = note.selected ? '#ffffaa' : (isActive ? '#ffffff' : adjustColor(color, -40))
      ctx.lineWidth = isActive ? 1.5 : 1
      ctx.strokeRect(nx + 0.5, ny + 1.5, nw - 1, nh - 2)
      ctx.lineWidth = 1
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
    ctx.strokeStyle = C.cursor; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, RULER_H - 4); ctx.lineTo(cx, RULER_H + noteH); ctx.stroke()
    ctx.fillStyle = C.cursor
    ctx.beginPath(); ctx.moveTo(cx-5,RULER_H-8); ctx.lineTo(cx+5,RULER_H-8); ctx.lineTo(cx,RULER_H-2); ctx.closePath(); ctx.fill()
  }

  // ── Ruler ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bgDark; ctx.fillRect(KEYS_W, 0, noteW, RULER_H)
  forEachBar(firstTick, lastTick, ppqV, ({ tick: barTick, barNum, num, den, barTicks }) => {
    const bx = KEYS_W + ticksToPx(barTick) - scrollX.value
    if (beatPx >= 24) {
      const beats = num * (4 / den)
      for (let b = 1; b < beats; b++) {
        const bbx = KEYS_W + ticksToPx(barTick + b * ppqV) - scrollX.value
        if (bbx > KEYS_W && bbx <= W) {
          ctx.strokeStyle = C.rulerBeat; ctx.lineWidth = 0.5
          ctx.beginPath(); ctx.moveTo(bbx + 0.5, RULER_H * 0.6); ctx.lineTo(bbx + 0.5, RULER_H); ctx.stroke()
        }
      }
    }
    if (bx < KEYS_W || bx > W) return
    ctx.strokeStyle = C.rulerBar; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(bx + 0.5, 0); ctx.lineTo(bx + 0.5, RULER_H); ctx.stroke()
    if (ticksToPx(barTicks) > 24) {
      ctx.fillStyle = C.textDim; ctx.font = '10px monospace'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(String(barNum), bx + 3, RULER_H * 0.72)
    }
  })

  // Time signature labels — one per TS change, at its bar position
  for (const ts of [...timeSigs.value].sort((a, b) => a.tick - b.tick)) {
    const tx = KEYS_W + ticksToPx(ts.tick) - scrollX.value
    if (tx < KEYS_W || tx > W) continue
    ctx.fillStyle = C.textGreen; ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`${ts.num}/${ts.den}`, tx + 3, RULER_H * 0.3)
  }

  // ── Piano keys ───────────────────────────────────────────────────────────────
  const activePitches = new Set()
  if (playing.value || (drag?.type === 'ruler' && drag?.button === 2)) {
    for (const track of trackData.value) {
      if (soloActive.value ? !track.solo : track.muted) continue
      for (const note of track.notes) {
        if (note.startTick <= currentTick.value && note.endTick > currentTick.value)
          activePitches.add(note.note)
      }
    }
  }

  ctx.fillStyle = C.bgDarker; ctx.fillRect(0, RULER_H, KEYS_W, noteH)
  for (let n = 127; n >= 0; n--) {
    const ky = RULER_H + noteToY(n) - scrollY.value
    if (ky + rh < RULER_H || ky > RULER_H + noteH) continue
    const isBlack = IS_BLACK[n % 12]
    const keyActive = activePitches.has(n)
    ctx.fillStyle = keyActive ? pianoActive : (isBlack ? C.pianoBlack : C.pianoWhite)
    const kw = isBlack ? KEYS_W * 0.65 : KEYS_W - 1
    ctx.fillRect(1, ky + 0.5, kw - 1, rh - 1)
    if (!isBlack) {
      ctx.strokeStyle = C.borderHard; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(1, ky+rh-0.5); ctx.lineTo(KEYS_W-1, ky+rh-0.5); ctx.stroke()
    }
    if (n % 12 === 0 && rh >= 7) {
      ctx.fillStyle = C.pianoText; ctx.font = `${Math.max(7, Math.min(10, rh-2))}px monospace`
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      ctx.fillText(`C${Math.floor(n/12)-1}`, KEYS_W - 3, ky + rh/2)
    }
  }
  ctx.strokeStyle = C.borderHard; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(KEYS_W-0.5,RULER_H); ctx.lineTo(KEYS_W-0.5,RULER_H+noteH); ctx.stroke()

  // ── Bottom lane (velocity / CC / BPM) ────────────────────────────────────────
  const velY = RULER_H + noteH
  ctx.fillStyle = C.bgDark; ctx.fillRect(KEYS_W, velY, noteW, VEL_H)
  ctx.strokeStyle = C.velBorder; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(KEYS_W, velY+0.5); ctx.lineTo(W, velY+0.5); ctx.stroke()

  if (laneMode.value === 'velocity') {
    for (let ti = 0; ti < trackData.value.length; ti++) {
      const track = trackData.value[ti]
      if (soloActive.value ? !track.solo : track.muted) continue
      for (const note of track.notes) {
        const vx = KEYS_W + ticksToPx(note.startTick) - scrollX.value
        if (vx < KEYS_W || vx > W) continue
        const nw = Math.max(2, ticksToPx(note.endTick - note.startTick))
        const bh = Math.max(2, (note.velocity / 127) * (VEL_H - 6))
        const barTop = velY + VEL_H - bh
        const color = note.selected ? '#ffffff' : track.color
        ctx.fillStyle = color
        ctx.globalAlpha = 0.75
        ctx.fillRect(vx - 1, barTop, 3, bh)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(vx + 1, barTop + 0.5)
        ctx.lineTo(vx + nw, barTop + 0.5)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

  } else if (laneMode.value === 'cc') {
    const track = trackData.value[activeTrack.value]
    if (track) {
      const color = track.color
      const evs = (track.ccEvents || []).filter(e => e.controller === ccNumber.value)
      const sorted = [...evs].sort((a, b) => a.tick - b.tick)

      // Step line
      if (sorted.length > 0) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5
        ctx.beginPath()
        let px2 = KEYS_W, py2 = velY + VEL_H
        // find initial value
        const firstEv = sorted[0]
        py2 = velY + 2 + (1 - firstEv.value / 127) * (VEL_H - 4)
        px2 = KEYS_W
        ctx.moveTo(px2, py2)
        for (const ev of sorted) {
          const ex = KEYS_W + ticksToPx(ev.tick) - scrollX.value
          const ey = velY + 2 + (1 - ev.value / 127) * (VEL_H - 4)
          ctx.lineTo(ex, py2)
          ctx.lineTo(ex, ey)
          px2 = ex; py2 = ey
        }
        ctx.lineTo(W, py2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Bars
      for (const ev of sorted) {
        const ex = KEYS_W + ticksToPx(ev.tick) - scrollX.value
        if (ex < KEYS_W || ex > W) continue
        const bh = Math.max(2, (ev.value / 127) * (VEL_H - 6))
        ctx.fillStyle = color; ctx.globalAlpha = 0.85
        ctx.fillRect(ex - 1, velY + VEL_H - bh, 3, bh)
        ctx.globalAlpha = 1
      }
    }

  } else if (laneMode.value === 'pc') {
    const track = trackData.value[activeTrack.value]
    if (track) {
      const color = track.color
      const allPc = [{ tick: 0, program: track.program ?? 0 }, ...(track.pcEvents || [])]
        .sort((a, b) => a.tick - b.tick)
      const isDrum = track.channel === 9

      // Step line
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5
      ctx.beginPath()
      let prevPy = velY + 2 + (1 - allPc[0].program / 127) * (VEL_H - 4)
      ctx.moveTo(KEYS_W, prevPy)
      for (const ev of allPc) {
        const ex = KEYS_W + ticksToPx(ev.tick) - scrollX.value
        const ey = velY + 2 + (1 - ev.program / 127) * (VEL_H - 4)
        ctx.lineTo(ex, prevPy); ctx.lineTo(ex, ey)
        prevPy = ey
      }
      ctx.lineTo(W, prevPy); ctx.stroke(); ctx.globalAlpha = 1

      // Dots + labels
      for (const ev of allPc) {
        const ex = KEYS_W + ticksToPx(ev.tick) - scrollX.value
        if (ex < KEYS_W - 8 || ex > W + 8) continue
        const ey = velY + 2 + (1 - ev.program / 127) * (VEL_H - 4)
        ctx.fillStyle = ev.tick === 0 ? C.pcDotFirst : color
        ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill()
        if (ex > KEYS_W + 4) {
          const name = isDrum
            ? (GM_DRUM_KITS[ev.program] ?? `Kit ${ev.program}`)
            : (GM_INSTRUMENTS[ev.program] ?? `Program ${ev.program}`)
          ctx.fillStyle = C.pcText; ctx.font = '8px sans-serif'
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillText(`${ev.program}: ${name}`, ex + 6, ey)
        }
      }
    }

  } else if (laneMode.value === 'bpm') {
    // BPM reference lines
    ctx.setLineDash([4, 4])
    for (const refBpm of [60, 90, 120, 150, 180, 240]) {
      if (refBpm <= BPM_MIN || refBpm >= BPM_MAX) continue
      const ry = velY + bpmToLaneY(refBpm, VEL_H)
      ctx.strokeStyle = C.bpmRefLine; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(KEYS_W, ry); ctx.lineTo(W, ry); ctx.stroke()
      ctx.fillStyle = C.bpmRefText; ctx.font = '8px monospace'; ctx.textAlign = 'left'
      ctx.fillText(`${refBpm}`, KEYS_W + 2, ry - 2)
    }
    ctx.setLineDash([])

    // Step curve
    const sorted = [...tempos.value].sort((a, b) => a.tick - b.tick)
    if (sorted.length > 0) {
      ctx.strokeStyle = C.bpmLine; ctx.lineWidth = 1.5
      ctx.beginPath()
      const firstBpm = 60000000 / sorted[0].tempo
      let prevY = velY + bpmToLaneY(firstBpm, VEL_H)
      ctx.moveTo(KEYS_W, prevY)
      for (const tc of sorted) {
        const tx = KEYS_W + ticksToPx(tc.tick) - scrollX.value
        const bpm = 60000000 / tc.tempo
        const ty = velY + bpmToLaneY(bpm, VEL_H)
        ctx.lineTo(tx, prevY)
        ctx.lineTo(tx, ty)
        prevY = ty
      }
      ctx.lineTo(W, prevY)
      ctx.stroke()

      // Dots + labels
      for (const tc of sorted) {
        const tx = KEYS_W + ticksToPx(tc.tick) - scrollX.value
        if (tx < KEYS_W - 8 || tx > W + 8) continue
        const bpm = Math.round(60000000 / tc.tempo)
        const ty = velY + bpmToLaneY(bpm, VEL_H)
        ctx.fillStyle = tc.tick === 0 ? C.bpmDotFirst : C.bpmLine
        ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = C.bpmDotStroke; ctx.lineWidth = 1
        ctx.stroke()
        if (tx > KEYS_W + 4) {
          ctx.fillStyle = C.bpmText; ctx.font = 'bold 9px monospace'
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillText(`${bpm}`, tx + 7, ty)
        }
      }
    }
  }

  // ── Box selection ────────────────────────────────────────────────────────────
  if (drag?.type === 'box-select') {
    const sx = Math.min(drag.startX, drag.curX)
    const sy = Math.min(drag.startY, drag.curY)
    const sw = Math.abs(drag.curX - drag.startX)
    const sh = Math.abs(drag.curY - drag.startY)
    ctx.save()
    ctx.beginPath()
    ctx.rect(KEYS_W, RULER_H, noteW, noteH)
    ctx.clip()
    ctx.strokeStyle = '#88aaff'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh)
    ctx.fillStyle = 'rgba(100,140,255,0.08)'
    ctx.fillRect(sx, sy, sw, sh)
    ctx.setLineDash([])
    ctx.restore()
  }

  // ── Corners ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bgDarker
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

watch(activeTrack, markDirty)

// ── Animation loop ─────────────────────────────────────────────────────────────
function startAnimation() {
  if (animFrameId) return
  function loop() {
    if (seq) {
      if (seq.isFinished) { stopPlayback(); draw(); return }
      const t = seq.currentHighResolutionTime ?? seq.currentTime ?? 0
      currentTick.value = secondsToTicks(t)
      ensureCursorVisible()
      updateTrackLoudness()
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

function updateTrackLoudness() {
  const tick = currentTick.value
  const result = {}
  for (const track of trackData.value) {
    const idx = track.index
    if (track.muted) { loudnessDecay[idx] = 0; result[idx] = 0; continue }
    let maxVel = 0
    for (const note of track.notes) {
      if (note.startTick <= tick && note.endTick > tick && note.velocity > maxVel) {
        maxVel = note.velocity
      }
    }
    if (loudnessDecay[idx] === undefined) loudnessDecay[idx] = 0
    if (maxVel >= loudnessDecay[idx]) {
      loudnessDecay[idx] = maxVel
    } else {
      loudnessDecay[idx] = Math.max(maxVel, loudnessDecay[idx] * 0.85)
    }
    result[idx] = loudnessDecay[idx] / 127
  }
  trackLoudness.value = result
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
  const nextSet = new Set(next.map(n => `${n.channel}-${n.note}`))
  for (const { channel, note } of rulerChordNotes)
    if (!nextSet.has(`${channel}-${note}`)) try { synth.noteOff(channel, note) } catch {}
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
  return !!rect && x >= KEYS_W && y >= RULER_H && y < rect.height - bottomLaneHeight.value
}

function inVelArea(x, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  return !!rect && x >= KEYS_W && y >= rect.height - bottomLaneHeight.value && y < rect.height
}

// Returns all visible {track, note} pairs in top-to-bottom Z order (topmost first).
// Matches the draw order: non-active tracks first, active track last → reverse to hit-test from top.
function notesTopFirst() {
  const result = []
  const tracks = trackData.value
  const nonActive = tracks.filter(t => t.index !== activeTrack.value)
  const active    = tracks.filter(t => t.index === activeTrack.value)
  for (const track of [...nonActive, ...active]) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) result.push({ track, note: n })
  }
  result.reverse()
  return result
}

function noteAtPos(x, y) {
  if (!inNoteArea(x, y)) return null
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const note = yToNote(y - RULER_H + scrollY.value)
  for (const item of notesTopFirst()) {
    const n = item.note
    if (n.note === note && n.startTick <= tick && n.endTick > tick) return item
  }
  return null
}

function noteResizeEdge(x, y) {
  const hit = noteAtPos(x, y)
  if (!hit) return null
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const edgeTicks = Math.max(pxToTicks(8), ppq.value / 32)
  const n = hit.note
  if (Math.abs(n.endTick - tick) < edgeTicks && n.startTick < tick) return hit
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

function setVelAtRange(x1, x2, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const newVel = Math.max(1, Math.min(127, Math.round((rect.height - y) / (bottomLaneHeight.value - 6) * 127)))
  const xMin = Math.min(x1, x2) - 4
  const xMax = Math.max(x1, x2) + 4
  let changed = false
  for (const track of trackData.value) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) {
      const nx = KEYS_W + ticksToPx(n.startTick) - scrollX.value
      if (nx >= xMin && nx <= xMax) { n.velocity = newVel; changed = true }
    }
  }
  if (changed) markDirty()
}

function findNearestTempoPx(x) {
  for (const tc of tempos.value) {
    const tx = KEYS_W + ticksToPx(tc.tick) - scrollX.value
    if (Math.abs(tx - x) < 8) return tc
  }
  return null
}

function drawCcAtPos(x, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const track = trackData.value[activeTrack.value]
  if (!track) return
  const tick = quantizeTick(Math.max(0, pxToTicks(x - KEYS_W + scrollX.value)))
  const laneY = y - (rect.height - bottomLaneHeight.value)
  const val = laneYToCcVal(laneY, bottomLaneHeight.value)
  const idx = track.ccEvents.findIndex(e => e.controller === ccNumber.value && e.tick === tick)
  if (idx >= 0) {
    track.ccEvents[idx].value = val
  } else {
    track.ccEvents.push({ tick, controller: ccNumber.value, value: val })
    track.ccEvents.sort((a, b) => a.tick - b.tick)
  }
  markDirty()
}

function eraseCcAtPos(x) {
  const track = trackData.value[activeTrack.value]
  if (!track) return
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const q = gridTicks() || Math.round(ppq.value / 4)
  const qi = Math.round(tick / q)
  const before = track.ccEvents.length
  track.ccEvents = track.ccEvents.filter(e =>
    e.controller !== ccNumber.value || Math.round(e.tick / q) !== qi
  )
  if (track.ccEvents.length !== before) markDirty()
}

function drawPcAtPos(x, y) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const track = trackData.value[activeTrack.value]
  if (!track) return
  const tick = Math.max(1, quantizeTick(pxToTicks(x - KEYS_W + scrollX.value)))
  const laneY = y - (rect.height - bottomLaneHeight.value)
  const prog = laneYToPcProg(laneY, bottomLaneHeight.value)
  const idx = track.pcEvents.findIndex(e => e.tick === tick)
  if (idx >= 0) track.pcEvents[idx].program = prog
  else { track.pcEvents.push({ tick, program: prog }); track.pcEvents.sort((a, b) => a.tick - b.tick) }
  markDirty()
}

function erasePcAtPos(x) {
  const track = trackData.value[activeTrack.value]
  if (!track) return
  const tick = pxToTicks(x - KEYS_W + scrollX.value)
  const q = gridTicks() || Math.round(ppq.value / 4)
  const qi = Math.round(tick / q)
  const before = track.pcEvents.length
  track.pcEvents = track.pcEvents.filter(e => Math.round(e.tick / q) !== qi)
  if (track.pcEvents.length !== before) markDirty()
}

function findNearestPcPx(x) {
  const track = trackData.value[activeTrack.value]
  if (!track) return null
  for (const ev of (track.pcEvents || [])) {
    const ex = KEYS_W + ticksToPx(ev.tick) - scrollX.value
    if (Math.abs(ex - x) < 8) return ev
  }
  return null
}

// ── Time-signature popup ──────────────────────────────────────────────────────
function tickToBarStart(tick) {
  const tsList = [...timeSigs.value].sort((a, b) => a.tick - b.tick)
  if (!tsList.length) return 0
  for (let si = tsList.length - 1; si >= 0; si--) {
    const ts = tsList[si]
    if (tick >= ts.tick) {
      const bt = ppq.value * ts.num * (4 / ts.den)
      return ts.tick + Math.floor((tick - ts.tick) / bt) * bt
    }
  }
  return 0
}

async function openTsDialog(canvasX, barTick) {
  const existing = timeSigs.value.find(ts => ts.tick === barTick)
  tsEditNum.value = existing?.num ?? 4
  tsEditDen.value = existing?.den ?? 4
  const cw = canvasRef.value?.getBoundingClientRect().width ?? 400
  tsDialog.value = { x: Math.min(canvasX, cw - 168), y: RULER_H + 4, tick: barTick, isNew: !existing }
  await nextTick()
  tsNumInputRef.value?.focus()
  tsNumInputRef.value?.select()
}

function commitTsDialog() {
  if (!tsDialog.value) return
  pushUndo()
  const num = Math.max(1, Math.min(32, Math.round(tsEditNum.value) || 4))
  const den = tsEditDen.value
  const { tick } = tsDialog.value
  const idx = timeSigs.value.findIndex(ts => ts.tick === tick)
  if (idx >= 0) timeSigs.value[idx] = { tick, num, den }
  else { timeSigs.value.push({ tick, num, den }); timeSigs.value.sort((a, b) => a.tick - b.tick) }
  tsDialog.value = null
  markDirty()
}

function deleteTsDialog() {
  if (!tsDialog.value || tsDialog.value.tick === 0) return
  pushUndo()
  timeSigs.value = timeSigs.value.filter(ts => ts.tick !== tsDialog.value.tick)
  tsDialog.value = null
  markDirty()
}

function onMouseDown(e) {
  const { x, y } = canvasCoords(e)

  if (y < RULER_H && x >= KEYS_W) {
    const tick = Math.max(0, pxToTicks(x - KEYS_W + scrollX.value))
    if (e.button === 2 && !e.ctrlKey) {
      openTsDialog(x, tickToBarStart(tick))
      return
    }
    currentTick.value = tick
    markDirty()
    if (e.button === 0) {
      if (seq) seq.currentTime = ticksToSeconds(tick)
      drag = { type: 'ruler', button: 0 }
    } else if (e.button === 2 && e.ctrlKey) {
      playChordAtTick(tick)
      drag = { type: 'ruler', button: 2 }
    }
    return
  }

  if (inVelArea(x, y)) {
    if (laneMode.value === 'velocity') {
      if (e.button === 0) {
        pushUndo()
        drag = { type: 'vel-draw', lastX: x }
        setVelAtRange(x, x, y)
      }
    } else if (laneMode.value === 'cc') {
      if (e.button === 2) {
        pushUndo()
        eraseCcAtPos(x)
      } else if (e.button === 0) {
        pushUndo()
        drag = { type: 'cc-draw' }
        drawCcAtPos(x, y)
      }
    } else if (laneMode.value === 'pc') {
      if (e.button === 2) {
        pushUndo()
        erasePcAtPos(x)
      } else if (e.button === 0) {
        pushUndo()
        drag = { type: 'pc-draw' }
        drawPcAtPos(x, y)
      }
    } else if (laneMode.value === 'bpm') {
      const tick = Math.max(0, pxToTicks(x - KEYS_W + scrollX.value))
      const rect = canvasRef.value.getBoundingClientRect()
      const laneY = y - (rect.height - bottomLaneHeight.value)
      const bpm = laneYToBpm(laneY, bottomLaneHeight.value)
      if (e.button === 2) {
        const nearest = findNearestTempoPx(x)
        if (nearest && nearest.tick !== 0) {
          pushUndo()
          tempos.value = tempos.value.filter(t => t !== nearest)
          markDirty()
        }
      } else if (e.button === 0) {
        pushUndo()
        const nearest = findNearestTempoPx(x)
        if (nearest) {
          drag = { type: 'bpm-move', tempo: nearest }
        } else {
          const newTempo = { tick: Math.max(1, tick), tempo: Math.round(60000000 / bpm) }
          tempos.value.push(newTempo)
          tempos.value.sort((a, b) => a.tick - b.tick)
          drag = { type: 'bpm-move', tempo: newTempo }
          markDirty()
        }
      }
    }
    return
  }

  if (!inNoteArea(x, y)) return

  if (e.button === 2) {
    pushUndo()
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

  // Ctrl+drag in note area → box selection
  if (e.ctrlKey && inNoteArea(x, y)) {
    if (!e.shiftKey) deselectAll()
    drag = { type: 'box-select', startX: x, startY: y, curX: x, curY: y, additive: e.shiftKey }
    return
  }

  const edge = noteResizeEdge(x, y)
  if (edge) {
    pushUndo()
    const targets = edge.note.selected ? getAllSelected() : [edge.note]
    drag = {
      type: 'resize', note: edge.note, origEndTick: edge.note.endTick,
      origPositions: targets.map(n => ({ note: n, endTick: n.endTick })),
    }
    return
  }

  const hit = noteAtPos(x, y)
  if (hit) {
    pushUndo()
    previewNote(hit.note.channel, hit.note.note, hit.note.velocity)
    if (!hit.note.selected) {
      deselectAll()
      hit.note.selected = true
    }
    const selectedNotes = getAllSelected()
    drag = {
      type: 'move', startX: x, startY: y, note: hit.note,
      origStart: hit.note.startTick, origNote: hit.note.note,
      origPositions: selectedNotes.map(n => ({ note: n, startTick: n.startTick, noteNum: n.note })),
    }
  } else {
    pushUndo()
    deselectAll()
    const st = quantizeTick(pxToTicks(x - KEYS_W + scrollX.value))
    const n  = yToNote(y - RULER_H + scrollY.value)
    const at = activeTrack.value < trackData.value.length ? activeTrack.value : 0
    const ch = trackData.value[at]?.channel ?? 0
    const newNote = { id: ++noteIdSeq, channel: ch, note: n, startTick: st,
                      endTick: st + defaultDuration(), velocity: 100, selected: false }
    if (trackData.value[at]) trackData.value[at].notes.push(newNote)
    previewNote(ch, n, 100)
    drag = { type: 'move', startX: x, startY: y, note: newNote, origStart: st, origNote: n,
             origPositions: [{ note: newNote, startTick: st, noteNum: n }] }
    markDirty()
  }
}

function onMouseMove(e) {
  if (uiDrag) return
  const { x, y } = canvasCoords(e)
  if (!drag) { updateCursor(x, y, e); return }

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

  if (drag.type === 'box-select') {
    drag.curX = x; drag.curY = y
    markDirty()
    return
  }

  if (drag.type === 'move') {
    const tickDelta = pxToTicks(x - drag.startX)
    const noteDelta = Math.round((drag.startY - y) / rowHeight())
    const anchorNewTick = Math.max(0, quantizeTick(drag.origStart + tickDelta))
    const anchorNewNote = Math.max(0, Math.min(127, drag.origNote + noteDelta))
    const anchorTickShift = anchorNewTick - drag.origStart
    const anchorNoteShift = anchorNewNote - drag.origNote

    if (drag.note.note !== anchorNewNote) previewNote(drag.note.channel, anchorNewNote, drag.note.velocity, true)

    const positions = drag.origPositions ?? [{ note: drag.note, startTick: drag.origStart, noteNum: drag.origNote }]
    let changed = false
    for (const orig of positions) {
      const newTick = Math.max(0, orig.startTick + anchorTickShift)
      const newNoteNum = Math.max(0, Math.min(127, orig.noteNum + anchorNoteShift))
      const dur = orig.note.endTick - orig.note.startTick
      if (orig.note.startTick !== newTick || orig.note.note !== newNoteNum) {
        orig.note.startTick = newTick
        orig.note.endTick   = newTick + dur
        orig.note.note      = newNoteNum
        changed = true
      }
    }
    if (changed) markDirty()
  } else if (drag.type === 'resize') {
    const newEndTick = Math.max(drag.note.startTick + ppq.value / 32,
                                quantizeTick(pxToTicks(x - KEYS_W + scrollX.value)))
    const delta = newEndTick - drag.origEndTick
    if (delta !== 0) {
      for (const orig of drag.origPositions)
        orig.note.endTick = Math.max(orig.note.startTick + ppq.value / 32, orig.endTick + delta)
      markDirty()
    }
  } else if (drag.type === 'erase') {
    const hit = noteAtPos(x, y)
    if (hit) { removeNote(hit.track, hit.note); markDirty() }
  } else if (drag.type === 'vel-draw') {
    if (inVelArea(x, y)) {
      setVelAtRange(drag.lastX, x, y)
      drag.lastX = x
    }
  } else if (drag.type === 'cc-draw') {
    if (inVelArea(x, y)) drawCcAtPos(x, y)
  } else if (drag.type === 'pc-draw') {
    if (inVelArea(x, y)) drawPcAtPos(x, y)
  } else if (drag.type === 'bpm-move') {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return
    const laneY = y - (rect.height - bottomLaneHeight.value)
    const bpm = laneYToBpm(laneY, bottomLaneHeight.value)
    drag.tempo.tempo = Math.round(60000000 / bpm)
    if (drag.tempo.tick !== 0) {
      const tick = Math.max(1, pxToTicks(x - KEYS_W + scrollX.value))
      drag.tempo.tick = tick
      tempos.value = [...tempos.value].sort((a, b) => a.tick - b.tick)
    }
    markDirty()
  }
}

function onMouseUp() {
  stopPreview()
  stopRulerPreview()
  if (drag?.type === 'box-select') {
    const x1 = Math.min(drag.startX, drag.curX)
    const x2 = Math.max(drag.startX, drag.curX)
    const y1 = Math.min(drag.startY, drag.curY)
    const y2 = Math.max(drag.startY, drag.curY)
    selectNotesInRect(x1, y1, x2, y2)
  }
  drag = null
  markDirty()
}

function onMouseLeave() {
  stopPreview()
  stopRulerPreview()
  const keepTypes = ['move', 'resize', 'ruler', 'vel-draw', 'cc-draw', 'pc-draw', 'bpm-move', 'box-select']
  if (!keepTypes.includes(drag?.type)) drag = null
}

function onWheel(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const noteH = rect.height - RULER_H - bottomLaneHeight.value
  const noteW = rect.width  - KEYS_W

  if (e.ctrlKey && e.altKey) {
    // Y zoom anchored to mouse Y
    const contentY = y - RULER_H + scrollY.value
    const factor   = e.deltaY < 0 ? 1.15 : 1/1.15
    zoomY.value    = Math.max(0.3, Math.min(4, zoomY.value * factor))
    scrollY.value  = Math.max(0, Math.min(128 * rowHeight() - noteH, contentY * factor - (y - RULER_H)))
  } else if (e.ctrlKey) {
    // X zoom anchored to mouse X — compute tick BEFORE changing zoom
    const tickAtMouse = pxToTicks(x - KEYS_W + scrollX.value)
    const factor      = e.deltaY < 0 ? 1.15 : 1/1.15
    zoomX.value       = Math.max(0.1, Math.min(16, zoomX.value * factor))
    scrollX.value     = Math.max(0, ticksToPx(tickAtMouse) - (x - KEYS_W))
  } else if (e.altKey) {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 4 : -4
    const selected = getAllSelected()
    if (selected.length) {
      pushUndo()
      for (const n of selected)
        n.velocity = Math.max(1, Math.min(127, n.velocity + delta))
      markDirty()
    } else {
      let target = null
      if (inVelArea(x, y)) target = noteAtVelPos(x)
      else if (inNoteArea(x, y)) target = noteAtPos(x, y)
      if (target) {
        pushUndo()
        target.note.velocity = Math.max(1, Math.min(127, target.note.velocity + delta))
        markDirty()
      }
    }
  } else if (e.shiftKey) {
    const maxSX = Math.max(0, ticksToPx(totalTicks.value) + 200 - noteW)
    scrollX.value = Math.max(0, Math.min(maxSX, scrollX.value + e.deltaY * 0.8))
  } else {
    const maxSY = Math.max(0, 128 * rowHeight() - noteH)
    scrollY.value = Math.max(0, Math.min(maxSY, scrollY.value + e.deltaY * 0.8))
  }
  markDirty()
}

function updateCursor(x, y, e) {
  if (!canvasRef.value) return
  let cursor = 'default'
  if (inVelArea(x, y)) {
    if (laneMode.value === 'velocity') cursor = 'crosshair'
    else if (laneMode.value === 'cc') cursor = 'crosshair'
    else if (laneMode.value === 'pc') cursor = findNearestPcPx(x) ? 'grab' : 'crosshair'
    else if (laneMode.value === 'bpm') cursor = findNearestTempoPx(x) ? 'grab' : 'crosshair'
  } else if (inNoteArea(x, y)) {
    if (e?.ctrlKey) cursor = 'crosshair'
    else if (noteResizeEdge(x, y)) cursor = 'ew-resize'
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

function deselectAll() {
  for (const track of trackData.value)
    for (const n of track.notes) n.selected = false
}

function getAllSelected() {
  const result = []
  for (const track of trackData.value)
    for (const n of track.notes) if (n.selected) result.push(n)
  return result
}

function selectNotesInRect(x1, y1, x2, y2) {
  const tick1 = pxToTicks(x1 - KEYS_W + scrollX.value)
  const tick2 = pxToTicks(x2 - KEYS_W + scrollX.value)
  const note1 = yToNote(y2 - RULER_H + scrollY.value)
  const note2 = yToNote(y1 - RULER_H + scrollY.value)
  for (const track of trackData.value) {
    if (soloActive.value ? !track.solo : track.muted) continue
    for (const n of track.notes) {
      if (n.note >= note1 && n.note <= note2 && n.startTick < tick2 && n.endTick > tick1)
        n.selected = true
    }
  }
}

function copySelected() {
  const selected = getAllSelected()
  if (!selected.length) return
  const minTick = Math.min(...selected.map(n => n.startTick))
  clipboard = {
    minTick,
    notes: selected.map(n => ({
      trackIndex: trackData.value.findIndex(t => t.notes.includes(n)),
      note: n.note,
      startOffset: n.startTick - minTick,
      duration: n.endTick - n.startTick,
      velocity: n.velocity,
      channel: n.channel,
    })),
  }
}

function pasteNotes() {
  if (!clipboard.notes?.length) return
  pushUndo()
  deselectAll()
  const step = defaultDuration()
  const insertTick = clipboard.minTick + step
  for (const c of clipboard.notes) {
    const trackIndex = c.trackIndex >= 0 && c.trackIndex < trackData.value.length
      ? c.trackIndex
      : (activeTrack.value < trackData.value.length ? activeTrack.value : 0)
    const track = trackData.value[trackIndex]
    if (!track) continue
    const startTick = insertTick + c.startOffset
    const newNote = {
      id: ++noteIdSeq, channel: c.channel, note: c.note,
      startTick, endTick: startTick + c.duration,
      velocity: c.velocity, selected: true,
    }
    track.notes.push(newNote)
  }
  // shift clipboard base so repeated pastes keep moving right
  clipboard = { ...clipboard, minTick: insertTick }
  markDirty()
}

// ── Loading ───────────────────────────────────────────────────────────────────
async function loadMidi() {
  loading.value = true; error.value = null
  _undoStack.length = 0; _redoStack.length = 0; undoVersion.value++
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
  const noteH = rect.height - RULER_H - bottomLaneHeight.value
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
    if (!url) throw new Error(t('midi.errors.sfRequired'))
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
  loudnessDecay = {}
  trackLoudness.value = {}
  stopAnimation()
  draw()
}

function stopPlayback() {
  if (seq) { try { seq.pause(); seq.currentTime = 0 } catch {} }
  playing.value = false
  currentTick.value = 0
  loudnessDecay = {}
  trackLoudness.value = {}
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
    eventBus?.emit('notification:show', { msg: t('midi.saved'), color: 'success' })
  } catch (e) {
    const detail = e.response?.data?.detail ?? e.message
    eventBus?.emit('notification:show', { msg: `${t('midi.saveFailed')}: ${detail}`, color: 'error' })
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
  pushUndo()
  const tempo = Math.round(60000000 / bpmVal)
  if (tempos.value.length && tempos.value[0].tick === 0) tempos.value[0].tempo = tempo
  else tempos.value.unshift({ tick: 0, tempo })
}

function changeProgram(track, program) {
  pushUndo()
  const tick = currentTick.value
  let activeEv = null
  for (const ev of (track.pcEvents || [])) {
    if (ev.tick <= tick) activeEv = ev
    else break
  }
  if (activeEv) activeEv.program = program
  else track.program = program
  if (synth && sfLoaded.value) {
    try { synth.programChange(track.channel, program) } catch {}
  }
  markDirty()
}

function changeChannel(track, ch) {
  const newCh = ch & 0x0F
  if (newCh === track.channel) return
  pushUndo()
  const oldCh = track.channel
  for (const note of track.notes) {
    if (note.channel === oldCh) note.channel = newCh
  }
  track.channel = newCh
  if (synth && sfLoaded.value) {
    try { synth.programChange(newCh, track.program ?? 0) } catch {}
  }
  markDirty()
}

function onKey({ key, ctrl, shift, raw }) {
  if (key === ' ') { raw.preventDefault(); togglePlay() }
  if (ctrl && key.toLowerCase() === 'z' && !shift) { raw.preventDefault(); undo(); return }
  if (ctrl && (key.toLowerCase() === 'y' || (shift && key.toLowerCase() === 'z'))) { raw.preventDefault(); redo(); return }
  if (ctrl && key === 'a') { raw.preventDefault(); selectAll() }
  if (ctrl && key === 'c') { raw.preventDefault(); copySelected() }
  if (ctrl && key === 'v') { raw.preventDefault(); pasteNotes() }
  if (key === 'Delete' || key === 'Backspace') { deleteSelected() }
  if (key === 'Escape') { deselectAll(); markDirty() }
  if ((shift || ctrl) && (key === 'ArrowUp' || key === 'ArrowDown')) {
    raw.preventDefault()
    const delta = (key === 'ArrowUp' ? 1 : -1) * (ctrl ? 12 : 1)
    shiftPitch(delta)
  }
}

function shiftPitch(delta) {
  pushUndo()
  const selected = getAllSelected()
  const targets = selected.length ? selected : trackData.value.flatMap(t => t.notes)
  for (const n of targets)
    n.note = Math.max(0, Math.min(127, n.note + delta))
  markDirty()
}

function deleteSelected() {
  pushUndo()
  for (const track of trackData.value)
    track.notes = track.notes.filter(n => !n.selected)
  markDirty()
}

function selectAll() {
  for (const track of trackData.value)
    for (const n of track.notes) n.selected = true
  markDirty()
}

// ── UI resize drag (track list width / bottom lane height) ────────────────────
function onTlResizerMousedown(e) {
  e.preventDefault()
  uiDrag = { type: 'tl', startX: e.clientX, startVal: trackListWidth.value }
  document.addEventListener('mousemove', onUiDragMove)
  document.addEventListener('mouseup', onUiDragUp)
}

function onLaneResizerMousedown(e) {
  e.preventDefault()
  uiDrag = { type: 'lane', startY: e.clientY, startVal: bottomLaneHeight.value }
  document.addEventListener('mousemove', onUiDragMove)
  document.addEventListener('mouseup', onUiDragUp)
}

function onUiDragMove(e) {
  if (!uiDrag) return
  if (uiDrag.type === 'tl') {
    trackListWidth.value = Math.max(120, Math.min(400, uiDrag.startVal + (e.clientX - uiDrag.startX)))
  } else {
    bottomLaneHeight.value = Math.max(40, Math.min(400, uiDrag.startVal - (e.clientY - uiDrag.startY)))
    markDirty()
  }
}

function onUiDragUp() {
  uiDrag = null
  document.removeEventListener('mousemove', onUiDragMove)
  document.removeEventListener('mouseup', onUiDragUp)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let ro = null

onMounted(async () => {
  await nextTick()
  ro = new ResizeObserver(markDirty)
  if (rollRef.value) ro.observe(rollRef.value)
  eventBus?.on('keyboard:keydown', onKey)
  await loadMidi()
  loadSoundFont()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onUiDragMove)
  document.removeEventListener('mouseup', onUiDragUp)
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

watch(isDark, () => nextTick(draw))
</script>

<template>
  <div class="midi-editor">
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
        <v-btn-group density="compact" variant="tonal" rounded="pill">
          <v-btn size="small" icon="mdi-skip-backward" @click="stopPlayback" />
          <v-btn size="small" :icon="playing ? 'mdi-pause' : 'mdi-play'"
            :color="playing ? 'primary' : undefined" @click="togglePlay" />
          <v-btn size="small" icon="mdi-repeat" :color="looping ? 'primary' : undefined"
            @click="looping = !looping" />
        </v-btn-group>

        <v-btn-group density="compact" variant="tonal" rounded="pill">
          <v-btn size="small" icon="mdi-undo" :disabled="!canUndo" @click="undo" />
          <v-btn size="small" icon="mdi-redo" :disabled="!canRedo" @click="redo" />
        </v-btn-group>

        <div class="pos-display font-mono">{{ positionDisplay }}</div>

        <v-text-field
          :model-value="currentBpm" @change="setBpm"
          hide-details density="compact" variant="outlined"
          type="number" min="20" max="300" suffix="BPM"
          style="width:106px;flex-shrink:0"
        />

        <v-select v-model="quantize" :items="QUANTIZE_OPTS"
          hide-details density="compact" variant="outlined" style="width:96px;flex-shrink:0" />

        <v-select v-if="laneMode==='cc'"
          v-model="ccNumber"
          :items="ccItemsSorted"
          hide-details density="compact" variant="outlined"
          style="width:160px;flex-shrink:0"
          @update:model-value="markDirty()"
        >
          <template #item="{ item, props }">
            <v-list-item v-bind="props">
              <template #title>
                <span class="cc-item-label">
                  <span class="cc-dot" :class="{ 'cc-dot--active': item.raw.inUse }" />
                  {{ item.raw.title }}
                </span>
              </template>
            </v-list-item>
          </template>
          <template #selection="{ item }">
            <span class="cc-item-label">
              <span class="cc-dot" :class="{ 'cc-dot--active': item.raw?.inUse }" />
              {{ item.raw?.title }}
            </span>
          </template>
        </v-select>

        <div class="zoom-group">
          <v-btn size="small" icon density="compact" variant="text"
            @click="zoomX = Math.max(0.1, +(zoomX-0.25).toFixed(2))">
            <v-icon size="16">mdi-magnify-minus-outline</v-icon>
          </v-btn>
          <span class="zoom-label">{{ Math.round(zoomX * 100) }}%</span>
          <v-btn size="small" icon density="compact" variant="text"
            @click="zoomX = Math.min(16, +(zoomX+0.25).toFixed(2))">
            <v-icon size="16">mdi-magnify-plus-outline</v-icon>
          </v-btn>
        </div>

        <div style="flex:1" />

        <v-btn size="small" :color="sfLoaded ? 'success' : 'warning'" variant="tonal"
          rounded="pill" prepend-icon="mdi-music" @click="showSFDialog = true">
          {{ sfLoaded ? t('midi.soundFontLoaded') : t('midi.loadSoundFont') }}
        </v-btn>

        <v-btn size="small" color="primary" variant="tonal" rounded="pill"
          prepend-icon="mdi-content-save" :loading="saving" @click="saveMidi">{{ t('midi.save') }}</v-btn>
      </div>

      <!-- ── Body ─────────────────────────────────────────────────────────── -->
      <div class="editor-body">
        <!-- Track list -->
        <div class="track-list" :style="{ width: trackListWidth + 'px' }">
          <div class="tl-header">
            <span class="text-overline">{{ t('midi.tracks') }}</span>
            <v-chip size="x-small" label class="ml-1" density="comfortable">{{ trackData.length }}</v-chip>
          </div>
          <div
            v-for="track in trackData" :key="track.index"
            v-ripple
            class="tl-row" :class="{ 'tl-row--active': activeTrack === track.index }"
            @click="activeTrack = track.index"
          >
            <div class="tl-color" :style="{background: track.color}" />
            <div class="tl-info">
              <div class="tl-name">{{ track.name }}</div>
              <div class="tl-meter">
                <div class="tl-meter-bar"
                  :style="{
                    width: ((trackLoudness[track.index] ?? 0) * 100).toFixed(1) + '%',
                    background: track.color,
                  }"
                />
              </div>
              <div class="tl-controls" :class="{ 'tl-controls--disabled': activeTrack !== track.index }">
                <v-select
                  :model-value="track.channel"
                  :items="CHANNEL_ITEMS"
                  hide-details density="compact" variant="plain"
                  class="tl-channel"
                  :disabled="activeTrack !== track.index"
                  @update:model-value="changeChannel(track, $event)"
                  @click.stop
                >
                  <template #selection="{ item }">Ch{{ item.value + 1 }}</template>
                </v-select>
                <v-select
                  :model-value="trackProgramAt(track, currentTick)"
                  :items="track.channel === 9 ? GM_DRUM_ITEMS : GM_ITEMS"
                  hide-details density="compact" variant="plain"
                  class="tl-program"
                  :disabled="activeTrack !== track.index"
                  @update:model-value="changeProgram(track, $event)"
                  @click.stop
                />
              </div>
            </div>
            <div class="tl-btns" @click.stop>
              <v-btn density="compact" :icon="track.muted ? 'mdi-volume-off' : 'mdi-volume-high'"
                size="x-small" variant="text"
                :color="track.muted ? 'error' : undefined"
                @click="track.muted = !track.muted; markDirty()" />
              <v-btn density="compact" icon="mdi-star" size="x-small" variant="text"
                :color="track.solo ? 'warning' : undefined"
                @click="track.solo = !track.solo; markDirty()" />
            </div>
          </div>
          <div class="tl-resizer" @mousedown="onTlResizerMousedown" />
        </div>

        <!-- Piano roll + lane overlay -->
        <div class="piano-roll" ref="rollRef" @contextmenu.prevent>
          <canvas ref="canvasRef" class="roll-canvas"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @wheel.prevent="onWheel"
          />

          <!-- Lane resizer handle -->
          <div class="lane-resizer" :style="{ bottom: bottomLaneHeight + 'px' }"
            @mousedown="onLaneResizerMousedown" />

          <!-- Lane mode controls (sits over the piano-keys column of the bottom lane) -->
          <div class="lane-overlay" :style="{ height: bottomLaneHeight + 'px' }" style="pointer-events:none">
            <div class="lane-mode-btns" style="pointer-events:auto">
              <button v-ripple class="lane-btn" :class="{active: laneMode==='velocity'}"
                @click="laneMode='velocity'; markDirty()">{{ t('midi.vel') }}</button>
              <button v-ripple class="lane-btn" :class="{active: laneMode==='cc'}"
                @click="laneMode='cc'; markDirty()">{{ t('midi.cc') }}</button>
              <button v-ripple class="lane-btn" :class="{active: laneMode==='bpm'}"
                @click="laneMode='bpm'; markDirty()">{{ t('midi.bpm') }}</button>
              <button v-ripple class="lane-btn" :class="{active: laneMode==='pc'}"
                @click="laneMode='pc'; markDirty()">{{ t('midi.pc') }}</button>
            </div>
          </div>

          <!-- TS dialog overlay (click-away to close) -->
          <div v-if="tsDialog" class="ts-overlay" @mousedown="tsDialog = null" />

          <!-- TS popup -->
          <v-card v-if="tsDialog" class="ts-popup" rounded="lg" elevation="3"
               :style="{ left: tsDialog.x + 'px', top: tsDialog.y + 'px' }"
               @mousedown.stop>
            <div class="ts-popup-title">
              {{ tsDialog.isNew ? t('midi.timeSig.add') : t('midi.timeSig.edit') }}
            </div>
            <div class="ts-popup-row">
              <input ref="tsNumInputRef" class="ts-input" type="number" min="1" max="32"
                     v-model.number="tsEditNum"
                     @keydown.enter="commitTsDialog" @keydown.escape="tsDialog = null" />
              <span class="ts-sep">/</span>
              <select class="ts-input ts-den" v-model.number="tsEditDen"
                      @keydown.enter="commitTsDialog" @keydown.escape="tsDialog = null">
                <option v-for="d in [1,2,4,8,16,32]" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
            <div class="ts-popup-actions">
              <v-btn size="small" variant="tonal" color="primary" @click="commitTsDialog">{{ t('midi.ok') }}</v-btn>
              <v-btn size="small" variant="text" @click="tsDialog = null">{{ t('midi.cancel') }}</v-btn>
              <v-spacer />
              <v-btn v-if="tsDialog.tick !== 0" size="small" variant="text" color="error"
                @click="deleteTsDialog">{{ t('midi.delete') }}</v-btn>
            </div>
          </v-card>
        </div>
      </div>
    </template>

    <!-- SoundFont dialog -->
    <v-dialog v-model="showSFDialog" max-width="480">
      <v-card rounded="xl">
        <v-card-title class="text-subtitle-1 pt-5 px-6">{{ t('midi.sfConfig') }}</v-card-title>
        <v-card-text class="px-6 pb-2">
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('midi.sfConfigDesc') }}
          </p>
          <v-text-field
            v-model="sfUrlInput"
            :label="t('midi.sfConfigLabel')"
            :placeholder="t('midi.sfConfigPlaceholder')"
            variant="outlined" hide-details
          />
          <div v-if="sfError" class="text-error text-body-2 mt-2">{{ sfError }}</div>
          <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mt-4 text-caption">
            {{ t('midi.sfConfigHelp') }}<br>
            {{ t('midi.sfConfigShortcuts') }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-6 pb-5">
          <v-spacer />
          <v-btn variant="text" rounded="pill" @click="showSFDialog = false">{{ t('midi.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" rounded="pill" :loading="sfLoading" @click="loadSoundFont">
            {{ t('midi.loadSoundFont') }}
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
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  overflow: hidden;
  position: relative;
}

.overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(var(--v-theme-surface), 0.9);
  z-index: 10;
}
.error-overlay { color: rgb(var(--v-theme-error)); }

/* ── Top bar ────────────────────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
  height: 52px;
  overflow: hidden;
}

.pos-display {
  font-family: monospace;
  font-size: 13px;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 20px;
  padding: 3px 12px;
  min-width: 96px;
  text-align: center;
  color: rgb(var(--v-theme-primary));
  flex-shrink: 0;
  letter-spacing: 0.04em;
}

.zoom-group {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 20px;
  padding: 0 2px;
}

.zoom-label {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
  opacity: 0.65;
}

/* ── Body ───────────────────────────────────────────────────── */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Track list ─────────────────────────────────────────────── */
.track-list {
  flex-shrink: 0;
  background: rgba(var(--v-theme-on-surface), 0.025);
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.tl-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
  z-index: 10;
}
.tl-resizer:hover { background: rgba(var(--v-theme-primary), 0.35); }

.tl-header {
  display: flex;
  align-items: center;
  padding: 8px 10px 6px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}

.tl-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 4px 5px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.25);
  cursor: pointer;
  transition: background 0.2s cubic-bezier(0.2, 0, 0, 1);
  min-height: 42px;
  position: relative;
  overflow: hidden;
}
.tl-row:hover { background: rgba(var(--v-theme-on-surface), 0.08); }
.tl-row--active { background: rgba(var(--v-theme-primary), 0.1); }
.tl-row--active:hover { background: rgba(var(--v-theme-primary), 0.14); }

.tl-color {
  width: 4px;
  align-self: stretch;
  border-radius: 4px;
  flex-shrink: 0;
  margin: 6px 0;
}

.tl-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.tl-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.87);
  line-height: 1.3;
}

.tl-meter {
  height: 3px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin: 1px 0;
}

.tl-meter-bar {
  height: 100%;
  border-radius: 3px;
  will-change: width;
  transition: width 0.05s linear;
}

.tl-btns {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.tl-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
}

.tl-controls--disabled {
  pointer-events: none;
  opacity: 0.45;
}

.tl-channel {
  flex: 0 0 auto;
  font-size: 10px !important;
}

.tl-channel :deep(.v-field__input) {
  font-size: 10px !important;
  padding: 0 2px !important;
  min-height: unset !important;
  min-width: unset !important;
  width: auto !important;
}

.tl-channel :deep(.v-field__append-inner) {
  display: none;
}

.tl-channel :deep(.v-field) {
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
}

.tl-program {
  flex: 1;
  min-width: 0;
  font-size: 10px !important;
}

.tl-program :deep(.v-field__input) {
  font-size: 10px !important;
  padding: 0 !important;
  min-height: unset !important;
}

.tl-program :deep(.v-field__append-inner) {
  display: none;
}

.tl-program :deep(.v-field) {
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
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

/* ── Lane resizer ─────────────────────────────────────────────── */
.lane-resizer {
  position: absolute;
  left: 72px;   /* KEYS_W */
  right: 0;
  height: 6px;
  margin-bottom: -3px;
  cursor: ns-resize;
  z-index: 10;
}
.lane-resizer:hover { background: rgba(var(--v-theme-primary), 0.35); }

/* ── Lane overlay ─────────────────────────────────────────────── */
.lane-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 72px;   /* KEYS_W */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-surface), 0.92);
  backdrop-filter: blur(4px);
}

.lane-mode-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 4px;
  padding: 6px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.lane-btn {
  font-size: 9px;
  font-weight: 600;
  padding: 0;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.55);
  cursor: pointer;
  letter-spacing: 0.06em;
  transition: background 0.2s cubic-bezier(0.2, 0, 0, 1),
              color 0.2s cubic-bezier(0.2, 0, 0, 1),
              border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.lane-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.10);
  color: rgba(var(--v-theme-on-surface), 0.87);
}
.lane-btn.active {
  background: rgba(var(--v-theme-primary), 0.15);
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.5);
}
.lane-btn.active:hover {
  background: rgba(var(--v-theme-primary), 0.22);
}

.cc-item-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cc-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
}

.cc-dot--active {
  background: rgb(var(--v-theme-primary));
}

/* ── TS popup ───────────────────────────────────────────────── */
.ts-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
}

.ts-popup {
  position: absolute;
  z-index: 10;
  min-width: 164px;
  padding: 12px 12px 8px;
}

.ts-popup-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgb(var(--v-theme-primary));
  margin-bottom: 10px;
}

.ts-popup-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.ts-input {
  background: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  color: rgb(var(--v-theme-on-surface));
  padding: 5px 6px;
  font-size: 13px;
  font-family: monospace;
  text-align: center;
  width: 46px;
  transition: border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.ts-den { width: 50px; cursor: pointer; }
.ts-input option { background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
.ts-input:focus {
  outline: none;
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.15);
}

.ts-sep { color: rgba(var(--v-theme-on-surface), 0.4); font-size: 18px; font-weight: 300; }

.ts-popup-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
</style>
