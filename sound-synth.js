// Sound effects and music, synthesized sample by sample (no audio files).
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
  const seconds = 0.7;
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

// Icy: a crack of filtered noise and a high, quickly fading chime.
export function freeze() {
  const noise = seeded(14);
  const crack = lowpass(make(0.6, x => noise() * env(x, 0.0005, 0.02)), 0.5);
  return make(0.6, (x, i) => 0.6 * crack[i] +
    0.3 * (Math.sin(TAU * 2637 * x) + Math.sin(TAU * 3136 * x)) * env(x, 0.002, 0.2));
}

export const musicBpm = 132;

// One 4-bar loop (C-Am-F-G) of the background track: kick, hats, snare, bouncing bass, melody.
export function music() {
  const noise = seeded(15);
  const beat = 60 / musicBpm;
  const out = new Float32Array(length(beat * 16));
  const roots = [130.81, 110, 87.31, 98];
  for (let b = 0; b < 16; b++) {
    const at = b * beat;
    const bar = Math.floor(b / 4) % 4;
    const root = roots[bar];
    if (b % 2 === 0) mixInto(out, make(0.12, x => Math.sin(TAU * 55 * x * Math.exp(-x * 8)) * env(x, 0.001, 0.06)), at, 0.9);
    for (const offset of [0, 0.5]) mixInto(out, make(0.03, x => noise() * env(x, 0.0005, 0.008)), at + offset * beat, 0.12);
    if (b % 4 === 1 || b % 4 === 3) mixInto(out, make(0.12, x => noise() * env(x, 0.001, 0.05)), at, 0.25);
    for (const [offset, multiple] of [[0, 1], [0.5, 2]]) {
      const note = lowpass(make(beat * 0.45, x => square(TAU * root * multiple * x)), 0.15);
      mixInto(out, note.map((value, i) => value * env(time(i), 0.003, 0.12)), at + offset * beat, 0.32);
    }
    const steps = bar % 2 === 0 ? [4, 7, 12, 7] : [3, 7, 10, 7];
    const frequency = root * 4 * 2 ** (steps[b % 4] / 12);
    mixInto(out, make(beat * 0.4, x => triangle(frequency * x) * env(x, 0.004, 0.1)), at, 0.09);
  }
  return out;
}

// Name -> [samples, gain], gains as mixed in the shorts.
export function renderEffects() {
  return {
    hit: [hit(), 0.9], tick: [tick(), 0.35], gust: [gust(), 0.6], shock: [shock(), 0.8],
    netUp: [net(true), 0.8], netDown: [net(false), 0.8], wah: [wah(), 0.7],
    win: [win(), 0.55], lose: [lose(), 0.55],
    invisible: [invisible(), 0.7], balloon: [balloon(), 0.7], freeze: [freeze(), 0.7]
  };
}
