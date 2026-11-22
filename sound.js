import { renderEffects, sampleRate, windAmbience } from './sound-synth.js';

const storageKey = 'oddbirdle-sound';

function readEnabled() {
  try {
    return localStorage.getItem(storageKey) !== 'off';
  } catch {
    return true;
  }
}

function saveEnabled(enabled) {
  try {
    localStorage.setItem(storageKey, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

// Web Audio player. Browsers only allow sound after a click or tap, so
// nothing is created until unlock() runs from one.
export function createSound() {
  let enabled = readEnabled();
  // Set by the portal (CrazyGames mute); overrides the in-game button.
  let portalMuted = false;
  const audible = () => enabled && !portalMuted;
  let context;
  let master;
  let buffers;
  let nextShuttleCue = 0;

  function toBuffer(samples) {
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  function build() {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return false;
    context = new AudioContext();
    // Soft clip like the shorts mix so loud moments stay round.
    const shaper = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 511.5 - 1) * 1.1) * 0.85;
    shaper.curve = curve;
    master = context.createGain();
    master.gain.value = audible() ? 1 : 0;
    master.connect(shaper).connect(context.destination);
    buffers = Object.fromEntries(Object.entries(renderEffects())
      .map(([name, [samples, gain]]) => [name, { buffer: toBuffer(samples), gain }]));
    return true;
  }

  function unlock() {
    try {
      if (!context && !build()) return;
      if (document.visibilityState === 'visible' && context.state !== 'running') context.resume();
    } catch {
      // No audio on this device; the game plays silently.
    }
  }

  function play(name, sequence = false) {
    const sound = buffers?.[name];
    if (!audible() || !sound || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    // Every hit sounds a little different.
    if (name === 'hit') source.playbackRate.value = 0.9 + Math.random() * 0.22;
    const gain = context.createGain();
    gain.gain.value = sound.gain;
    source.connect(gain).connect(master);
    if (sequence) {
      const at = Math.max(context.currentTime, nextShuttleCue);
      source.start(at);
      nextShuttleCue = at + sound.buffer.duration + 0.025;
    } else {
      source.start();
    }
  }

  // Background beds that run for a whole stage (wind). A bed fades in and out, starts at a random point of its loops
  // and is made of loops of different lengths, so it never sounds like it repeats.
  const beds = { wind: windAmbience };
  const running = new Map();
  const bedLevel = 0.16;
  function startBed(name) {
    if (running.has(name) || !context || context.state !== 'running') return;
    const layers = beds[name]();
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(master);
    const sources = layers.map(({ samples, gain }) => {
      const source = context.createBufferSource();
      source.buffer = toBuffer(samples);
      source.loop = true;
      const layerGain = context.createGain();
      layerGain.gain.value = gain;
      source.connect(layerGain).connect(level);
      source.start(0, Math.random() * source.buffer.duration);
      return source;
    });
    level.gain.setTargetAtTime(bedLevel, context.currentTime, 0.9);
    running.set(name, { sources, level });
  }
  function stopBed(name) {
    const bed = running.get(name);
    if (!bed) return;
    running.delete(name);
    bed.level.gain.setTargetAtTime(0, context.currentTime, 0.35);
    setTimeout(() => { for (const source of bed.sources) { try { source.stop(); } catch { /* already stopped */ } } bed.level.disconnect(); }, 2500);
  }
  function setBed(name, on) {
    if (!beds[name]) return;
    if (on) startBed(name); else stopBed(name);
  }

  function applyGain() {
    if (master) master.gain.setTargetAtTime(audible() ? 1 : 0, context.currentTime, 0.02);
  }

  function setEnabled(next) {
    enabled = next;
    saveEnabled(enabled);
    applyGain();
  }

  // Hidden tabs (and portal frames scrolled away) go quiet.
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.visibilityState === 'hidden') context.suspend();
    else context.resume();
  });

  return {
    unlock, play, setBed,
    get enabled() { return enabled; },
    get audible() { return audible(); },
    get portalMuted() { return portalMuted; },
    setPortalMuted(muted) {
      portalMuted = muted;
      applyGain();
    },
    toggle() { setEnabled(!enabled); return enabled; }
  };
}
