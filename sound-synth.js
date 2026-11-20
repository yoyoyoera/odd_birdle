// Sound effects, synthesized sample by sample (no audio files).
// Ported from the shorts soundtrack (numpy) so the game sounds the same.
export const sampleRate = 44100;
const TAU = Math.PI * 2;

function seeded(seed) {
  let value = seed;
  const uniform = () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
  // Standard normal noise (Box-Muller).
  return () => Math.sqrt(-2 * Math.log(uniform() || 1e-12)) * Math.cos(TAU * uniform());
}

const length = seconds => Math.round(sampleRate * seconds);
const time = i => i / sampleRate;

function make(seconds, sample) {
  const out = new Float32Array(length(seconds));
  for (let i = 0; i < out.length; i++) out[i] = sample(time(i), i);
  return out;
}

// Attack then exponential decay.
const env = (x, attack = 0.003, decay = 0.05) => Math.min(1, x / attack) * Math.exp(-x / decay);
const square = phase => Math.sign(Math.sin(phase));
const triangle = cycles => 2 * Math.abs(2 * (((cycles % 1) + 1) % 1) - 1) - 1;

// Exponential pitch slide; returns phases so any waveform can use it.
function slidePhases(f0, f1, seconds) {
  const phases = new Float64Array(length(seconds));
  let phase = 0;
  for (let i = 0; i < phases.length; i++) {
    phase += TAU * f0 * (f1 / f0) ** (time(i) / seconds) / sampleRate;
    phases[i] = phase;
  }
  return phases;
}

function lowpass(samples, amount) {
  let state = 0;
  for (let i = 0; i < samples.length; i++) {
    state += amount * (samples[i] - state);
    samples[i] = state;
  }
  return samples;
}

function mixInto(target, source, at, gain = 1) {
  const start = length(at);
  for (let i = 0; i < source.length && start + i < target.length; i++) target[start + i] += gain * source[i];
  return target;
}

export function hit() {
  const noise = seeded(11);
  const seconds = 0.09;
  const phases = slidePhases(1300, 650, seconds);
  return make(seconds, (x, i) => 0.8 * Math.sin(phases[i]) * env(x, 0.001, 0.028) + 0.35 * noise() * env(x, 0.0005, 0.006));
}

export function tick() {
  return make(0.05, x => Math.sin(TAU * 1650 * x) * env(x, 0.001, 0.015));
}

export function gust() {
  const noise = seeded(12);
  const seconds = 1.5;
  const wind = lowpass(make(seconds, () => noise()), 0.08);
  return wind.map((value, i) => value * 3 * Math.sin(Math.PI * time(i) / seconds) ** 2);
}

export function shock() {
  const noise = seeded(13);
  return make(0.4, x => {
    const buzz = Math.sign(Math.sin(TAU * 90 * x)) * (0.6 + 0.4 * Math.sign(Math.sin(TAU * 30 * x)));
    return (0.55 * buzz + 0.35 * noise()) * env(x, 0.002, 0.15);
  });
}

export function net(up) {
  const phases = up ? slidePhases(300, 700, 0.45) : slidePhases(700, 260, 0.45);
  return make(0.45, (x, i) => square(phases[i]) * 0.35 * env(x, 0.005, 0.25));
}

export function wah() {
  const first = make(0.22, x => triangle(392 * x) * env(x, 0.01, 0.12));
  const phases = slidePhases(370, 250, 0.42);
  const second = make(0.42, (x, i) => triangle(phases[i] / TAU) * env(x, 0.01, 0.25));
  const out = new Float32Array(first.length + second.length);
  out.set(first);
  out.set(second, first.length);
  return out.map(value => value * 0.7);
}

function arpeggio(notes) {
  const out = new Float32Array(length(1.6));
  notes.forEach(([frequency, start], index) => {
    const last = index === notes.length - 1;
    const seconds = last ? 1.2 : 0.3;
    mixInto(out, make(seconds, x => 0.5 * square(TAU * frequency * x) * env(x, 0.004, last ? 0.35 : 0.12)), start);
  });
  return out;
}

export function win() {
  return arpeggio([[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]]);
}

// Same shape as the win jingle, falling instead of rising.
export function lose() {
  return arpeggio([[392, 0], [329.63, 0.14], [261.63, 0.28], [196, 0.42]]);
}

// Point for you: two bright rising square blips.
export function pointWon() {
  const out = new Float32Array(length(0.3));
  mixInto(out, make(0.1, x => 0.5 * square(TAU * 1046.5 * x) * env(x, 0.002, 0.05)), 0);
  mixInto(out, make(0.2, x => 0.5 * square(TAU * 1568 * x) * env(x, 0.002, 0.08)), 0.08);
  return out;
}

// Point for the other side: a low falling thud, softer than the taunt.
export function pointLost() {
  const phases = slidePhases(220, 130, 0.28);
  return make(0.28, (x, i) => 0.6 * square(phases[i]) * env(x, 0.003, 0.09));
}

// New in the same style: a shimmering upward sweep that fades away.
export function invisible() {
  const phases = slidePhases(600, 2000, 0.5);
  return make(0.5, (x, i) => Math.sin(phases[i]) * (0.55 + 0.45 * Math.sin(TAU * 18 * x)) * env(x, 0.01, 0.18) * 0.6);
}

// Inflating: a wobbly triangle that swells and rises.
export function balloon() {
  const phases = slidePhases(180, 520, 0.55);
  return make(0.55, (x, i) => triangle((phases[i] + 0.6 * Math.sin(TAU * 7 * x)) / TAU) *
    Math.min(1, x / 0.25) * Math.exp(-Math.max(0, x - 0.35) / 0.08) * 0.6);
}

// 두웅: a low, round tone whose pitch sags and then springs back, with a soft thump at the start.
// TRAMPOLINE (landing) and BALLOON use it, at different pitches.
export function doong(base = 150, seconds = 0.7) {
  const noise = seeded(41);
  let phase = 0;
  return make(seconds, x => {
    const wobble = 1 + 0.06 * Math.sin(TAU * 9 * x) * Math.exp(-x / 0.3);
    phase += TAU * base * (0.62 + 0.38 * Math.exp(-x / 0.12)) * wobble / sampleRate;
    const body = Math.sin(phase) + 0.35 * Math.sin(2 * phase) * Math.exp(-x / 0.1);
    return 0.75 * body * env(x, 0.004, 0.24) + 0.2 * noise() * env(x, 0.0005, 0.01);
  });
}

// 팡: a burst, a quick falling pop with a puff of noise (a fake shuttle bursting).
export function pop() {
  const noise = seeded(42);
  const phases = slidePhases(1100, 260, 0.22);
  return make(0.22, (x, i) => 0.7 * Math.sin(phases[i]) * env(x, 0.0008, 0.05) + 0.6 * noise() * env(x, 0.0004, 0.025));
}

// BUMPER: a bright pinball "ting" over a short low thock when the shuttle bounces off the post.
export function bumper() {
  return make(0.4, x => 0.45 * (Math.sin(TAU * 1175 * x) + 0.7 * Math.sin(TAU * 1760 * 1.003 * x)) * env(x, 0.001, 0.11) +
    0.5 * Math.sin(TAU * 196 * x) * env(x, 0.002, 0.05));
}

// The post popping up: a short rising blip.
export function bumperIn() {
  const phases = slidePhases(320, 900, 0.25);
  return make(0.25, (x, i) => 0.6 * triangle(phases[i] / TAU) * env(x, 0.005, 0.1));
}

// The shuttle splitting: two quick rising blips.
export function decoyIn() {
  const out = new Float32Array(length(0.22));
  mixInto(out, make(0.09, x => 0.5 * square(TAU * 880 * x) * env(x, 0.002, 0.04)), 0);
  mixInto(out, make(0.12, x => 0.5 * square(TAU * 1320 * x) * env(x, 0.002, 0.05)), 0.07);
  return out;
}

// Icy: a crack of filtered noise and a high, quickly fading chime.
export function freeze() {
  const noise = seeded(14);
  const crack = lowpass(make(0.6, x => noise() * env(x, 0.0005, 0.02)), 0.5);
  return make(0.6, (x, i) => 0.6 * crack[i] +
    0.3 * (Math.sin(TAU * 2637 * x) + Math.sin(TAU * 3136 * x)) * env(x, 0.002, 0.2));
}

function uniform(seed) {
  let value = seed;
  return () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// The crowd clapping: separate pats, each a short "pop" (a damped tone with a little noise in it, at its own pitch),
// thinning in and out over the length. No steady hiss underneath, which would sound like rain.
export function applause(seconds = 2.2, perSecond = 34) {
  const random = uniform(31);
  const noise = seeded(32);
  const out = new Float32Array(length(seconds));
  const swell = x => Math.sin(Math.PI * Math.min(1, x / seconds)) ** 0.8;
  for (let k = 0; k < perSecond * seconds * 1.6; k++) {
    const at = random() * seconds;
    if (random() > swell(at)) continue;
    const pitch = 700 + random() * 1700;
    const gain = 0.25 + 0.55 * random();
    const decay = 0.004 + random() * 0.005;
    const start = length(at);
    for (let i = 0; i < length(0.05) && start + i < out.length; i++) {
      const x = i / sampleRate;
      const pop = Math.sin(TAU * pitch * x) * 0.7 + noise() * 0.5;
      out[start + i] += pop * gain * Math.exp(-x / decay) * Math.min(1, x / 0.0008);
    }
  }
  return out;
}

// NET CORD: a dry tick off the tape with a short low string twang under it.
export function cord() {
  const noise = seeded(41);
  return make(0.18, x => 0.55 * noise() * env(x, 0.0004, 0.004) + 0.5 * Math.sin(TAU * 2200 * x) * env(x, 0.0008, 0.012) +
    0.35 * Math.sin(TAU * 140 * x + 0.6 * Math.sin(TAU * 7 * x)) * env(x, 0.002, 0.07));
}

// The crowd's "ooh": many voices on a gliding vowel, rising then falling, softly.
export function ooh(seconds = 0.9) {
  const random = uniform(51);
  const voices = Array.from({ length: 14 }, () => ({ pitch: 150 + random() * 160, phase: random() * TAU, vibrato: 4 + random() * 3 }));
  const out = new Float32Array(length(seconds));
  for (let i = 0; i < out.length; i++) {
    const x = time(i);
    const glide = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, x / seconds));
    let sum = 0;
    for (const voice of voices) {
      const f = voice.pitch * glide * (1 + 0.012 * Math.sin(TAU * voice.vibrato * x));
      // A round "oo": the fundamental with only a little of the next two harmonics.
      const p = TAU * f * x + voice.phase;
      sum += Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.08 * Math.sin(3 * p);
    }
    out[i] = sum / voices.length * Math.sin(Math.PI * Math.min(1, x / seconds)) ** 1.5;
  }
  return lowpass(out, 0.25);
}

// Name -> [samples, gain], gains as mixed in the shorts.
export function renderEffects() {
  return {
    hit: [hit(), 0.9], tick: [tick(), 0.35], gust: [gust(), 0.6], shock: [shock(), 0.8],
    netUp: [net(true), 0.8], netDown: [net(false), 0.8], wah: [wah(), 0.7],
    win: [win(), 0.55], lose: [lose(), 0.55], pointWon: [pointWon(), 0.45], pointLost: [pointLost(), 0.5],
    invisible: [invisible(), 0.7], balloon: [balloon(), 0.7], freeze: [freeze(), 0.7],
    doong: [doong(170, 0.6), 0.9], boing: [doong(115, 0.55), 1], pop: [pop(), 0.8],
    bumper: [bumper(), 0.7], bumperIn: [bumperIn(), 0.5], decoyIn: [decoyIn(), 0.45],
    applauseBig: [applause(2.2, 34), 0.35], cord: [cord(), 0.6], ooh: [ooh(), 0.9]
  };
}

// --- Wind ambience (stage "Windy Day") ---
// Wind as it is outdoors: a deep, soft rumble with a gentle, wide "whoosh" on top that swells and fades with the gusts,
// and nothing sharp or hissy. No hiss means no white-noise top end: the noise is passed through several low-pass stages.
// It must also not sound like a loop. Two layers of different lengths (13.1 s and 19.3 s) play together, each looping on
// its own, so they only line up again after minutes; each starts at a random point; and each layer is itself seamless:
// its end is crossfaded into its start, and its swells are built from whole numbers of cycles per loop, so volume and
// tone meet exactly where the loop wraps.
const onePole = hertz => 1 - Math.exp(-TAU * hertz / sampleRate);

function windLayer(seconds, seed, { lows, subtract, swells, floor }) {
  const noise = seeded(seed);
  const loopLength = length(seconds);
  const fadeLength = length(0.8);
  const raw = new Float32Array(loopLength + fadeLength);
  const poles = lows.map(onePole), states = lows.map(() => 0);
  const subtractPole = subtract ? onePole(subtract) : 0;
  let subtractState = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = noise();
    let value = white;
    for (let p = 0; p < poles.length; p++) { states[p] += poles[p] * (value - states[p]); value = states[p]; }
    if (subtract) { subtractState += subtractPole * (white - subtractState); value -= subtractState * 0.9; }
    raw[i] = value;
  }
  // Equal-power crossfade: the sample after the last one is the one that follows it in the original stream.
  const layer = new Float32Array(loopLength);
  for (let i = 0; i < loopLength; i++) {
    if (i < fadeLength) {
      const angle = Math.PI / 2 * i / fadeLength;
      layer[i] = raw[i] * Math.sin(angle) + raw[loopLength + i] * Math.cos(angle);
    } else layer[i] = raw[i];
  }
  // Gusts: swells with a whole number of cycles per loop, so the first and last sample have the same volume.
  let peak = 0;
  for (let i = 0; i < loopLength; i++) {
    const t = i / loopLength;
    let swell = 0.5;
    for (const [cycles, depth, phase] of swells) swell += depth * Math.sin(TAU * (cycles * t + phase));
    layer[i] *= Math.max(floor, swell);
    peak = Math.max(peak, Math.abs(layer[i]));
  }
  for (let i = 0; i < loopLength; i++) layer[i] /= peak || 1;
  return layer;
}

export function windAmbience() {
  return [
    // The rumble: low and round, with long, deep swells.
    { samples: windLayer(13.1, 4242, { lows: [150, 150, 150], swells: [[2, 0.3, 0.1], [5, 0.12, 0.6], [9, 0.05, 0.3]], floor: 0.12 }), gain: 0.8 },
    // The whoosh: a soft band in the low mids that comes and goes with its own gusts.
    { samples: windLayer(19.3, 9091, { lows: [320, 320, 320, 320], subtract: 110, swells: [[3, 0.34, 0.45], [7, 0.1, 0.05], [13, 0.04, 0.8]], floor: 0.04 }), gain: 0.3 }
  ];
}
