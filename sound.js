import { renderEffects, sampleRate } from './sound-synth.js';

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

  function play(name) {
    const sound = buffers?.[name];
    if (!audible() || !sound || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    // Every hit sounds a little different.
    if (name === 'hit') source.playbackRate.value = 0.9 + Math.random() * 0.22;
    const gain = context.createGain();
    gain.gain.value = sound.gain;
    source.connect(gain).connect(master);
    source.start();
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
    unlock, play,
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
