// Procedural sound effects — every cue here is synthesized on the fly with
// the Web Audio API, not loaded from an audio file. There are no audio
// assets anywhere in this project; this keeps it that way (no binary
// assets to fetch, cache, or license), at the cost of the cues being simple
// tones/noise bursts rather than sampled sound. That trade fits a game
// whose whole visual language (dice, tracers, silhouettes) is already
// code-drawn rather than art-asset-driven.
//
// Every `play*` call is a no-op if the sound setting is off (see
// soundPreference.ts) or if Web Audio isn't available at all (very old
// browsers, some embedded webviews) — sound is enhancement, never a
// dependency the game logic relies on.

import { isSoundOn } from './soundPreference';

export type SfxKind =
  | 'hitDealt' // your ship's die connected
  | 'hitTaken' // an enemy die connected
  | 'miss' // a natural 1, or an ordinary miss
  | 'dodge' // jink/thrusters — the shot was thrown wide on purpose
  | 'block' // shield/evasion absorbed a hit that would otherwise land
  | 'kill' // an enemy ship destroyed
  | 'shipLost' // one of yours destroyed
  | 'outspeed' // a ship earns its bonus activation
  | 'effect' // a card or passive part effect resolves
  | 'victory'
  | 'defeat';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

// Safari (desktop and iOS) still only exposes the constructor under the
// vendor-prefixed name in some versions — this is the standard feature-
// detect for that, not a TypeScript workaround.
function getWindowAudioCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getWindowAudioCtor();
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  // Headroom for several overlapping cues (a volley's hits/misses can land
  // within milliseconds of each other) without clipping.
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  return ctx;
}

// One second of white noise, generated once and reused (via a fresh
// BufferSource each play, per the Web Audio API's one-shot-per-source
// design) for every noise-based cue — a shield block's metallic edge, an
// explosion's crackle, a miss's thin sizzle.
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = context.sampleRate; // 1 second, more than any cue needs
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

// A single oscillator voice with a frequency sweep (or none, if freqEnd is
// omitted) and a linear-ish decay envelope. `delay` staggers notes within a
// sequence (victory/defeat's little arpeggios) without needing setTimeout —
// everything here is scheduled on the audio clock, which stays accurate
// even if the main thread is briefly busy.
function tone(
  context: AudioContext,
  out: AudioNode,
  opts: {
    freqStart: number;
    freqEnd?: number;
    type?: OscillatorType;
    duration: number; // seconds
    peakGain?: number;
    delay?: number; // seconds from now
    lowpassHz?: number;
  },
): void {
  const start = context.currentTime + (opts.delay ?? 0);
  const end = start + opts.duration;
  const osc = context.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freqStart, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), end);
  }

  const gain = context.createGain();
  const peak = opts.peakGain ?? 0.8;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.008, opts.duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  let node: AudioNode = osc;
  if (opts.lowpassHz !== undefined) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.lowpassHz;
    osc.connect(filter);
    node = filter;
  }
  node.connect(gain);
  gain.connect(out);

  osc.start(start);
  osc.stop(end + 0.02);
}

// A burst of the shared noise buffer through a bandpass filter — the
// texture behind explosions, impacts, and misses. `filterHz` picks where in
// the noise spectrum the burst sits (low = dull thud, high = thin sizzle);
// `q` narrows or widens that band.
function noiseBurst(
  context: AudioContext,
  out: AudioNode,
  opts: { duration: number; filterHz: number; q?: number; peakGain?: number; delay?: number },
): void {
  const start = context.currentTime + (opts.delay ?? 0);
  const end = start + opts.duration;
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.filterHz;
  filter.Q.value = opts.q ?? 0.7;

  const gain = context.createGain();
  const peak = opts.peakGain ?? 0.6;
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);

  src.start(start);
  src.stop(end + 0.02);
}

const CUES: Record<SfxKind, (context: AudioContext, out: AudioNode) => void> = {
  // Bright, quick, satisfying — a square wave falling in pitch reads as
  // impact rather than a musical note.
  hitDealt: (c, o) => tone(c, o, { freqStart: 950, freqEnd: 320, type: 'square', duration: 0.09, peakGain: 0.5 }),
  // Same shape, lower and duller (a lowpass takes the edge off) — the same
  // event from the receiving end shouldn't sound identical to landing one.
  hitTaken: (c, o) =>
    tone(c, o, { freqStart: 260, freqEnd: 110, type: 'sawtooth', duration: 0.12, peakGain: 0.45, lowpassHz: 900 }),
  // A natural 1 or an ordinary whiff — thin, brief, unsatisfying on purpose.
  miss: (c, o) => noiseBurst(c, o, { duration: 0.06, filterHz: 2200, q: 1.2, peakGain: 0.22 }),
  // An upward, airy sweep — the shot went somewhere else entirely.
  dodge: (c, o) => tone(c, o, { freqStart: 340, freqEnd: 980, type: 'sine', duration: 0.11, peakGain: 0.3 }),
  // A short metallic ping (two close, slightly detuned tones) over a soft
  // noise edge — reads as "hit something hard," not "hit nothing."
  block: (c, o) => {
    tone(c, o, { freqStart: 1200, type: 'triangle', duration: 0.12, peakGain: 0.3 });
    tone(c, o, { freqStart: 1250, type: 'triangle', duration: 0.1, peakGain: 0.18, delay: 0.01 });
    noiseBurst(c, o, { duration: 0.05, filterHz: 3000, q: 0.9, peakGain: 0.15 });
  },
  // A real explosion: noise crackle plus a low sine thump underneath.
  kill: (c, o) => {
    noiseBurst(c, o, { duration: 0.22, filterHz: 900, q: 0.6, peakGain: 0.5 });
    tone(c, o, { freqStart: 180, freqEnd: 40, type: 'sine', duration: 0.22, peakGain: 0.45 });
  },
  // The same shape, longer and lower — a loss should land heavier than a kill.
  shipLost: (c, o) => {
    noiseBurst(c, o, { duration: 0.32, filterHz: 500, q: 0.5, peakGain: 0.55 });
    tone(c, o, { freqStart: 130, freqEnd: 30, type: 'sine', duration: 0.34, peakGain: 0.5 });
  },
  // Two quick ascending blips — an extra activation earned mid-round.
  outspeed: (c, o) => {
    tone(c, o, { freqStart: 500, type: 'triangle', duration: 0.07, peakGain: 0.3 });
    tone(c, o, { freqStart: 700, type: 'triangle', duration: 0.09, peakGain: 0.32, delay: 0.07 });
  },
  // A soft, neutral chime for a card play or a passive part triggering.
  effect: (c, o) => tone(c, o, { freqStart: 700, type: 'sine', duration: 0.08, peakGain: 0.25 }),
  // A short ascending major-ish arpeggio.
  victory: (c, o) => {
    tone(c, o, { freqStart: 523, type: 'triangle', duration: 0.16, peakGain: 0.4 });
    tone(c, o, { freqStart: 659, type: 'triangle', duration: 0.16, peakGain: 0.4, delay: 0.14 });
    tone(c, o, { freqStart: 784, type: 'triangle', duration: 0.3, peakGain: 0.45, delay: 0.28 });
  },
  // A short descending, minor-leaning sequence.
  defeat: (c, o) => {
    tone(c, o, { freqStart: 392, type: 'sawtooth', duration: 0.22, peakGain: 0.35, lowpassHz: 1200, delay: 0 });
    tone(c, o, { freqStart: 311, type: 'sawtooth', duration: 0.22, peakGain: 0.35, lowpassHz: 1200, delay: 0.2 });
    tone(c, o, { freqStart: 233, type: 'sawtooth', duration: 0.4, peakGain: 0.4, lowpassHz: 900, delay: 0.4 });
  },
};

export function playSfx(kind: SfxKind): void {
  if (!isSoundOn()) return;
  const context = getContext();
  if (!context || !master) return;
  // Browsers start a freshly-created AudioContext suspended until a user
  // gesture resumes it. Every call here is already downstream of one (a
  // button click that dispatched a game action), so this just catches the
  // first call after that context was constructed.
  if (context.state === 'suspended') void context.resume();
  CUES[kind](context, master);
}
