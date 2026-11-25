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

// A context that can be started again: 'suspended' (not started yet, a hidden tab, the app in the background) or, in
// Safari and the iOS app, 'interrupted' (a phone call, an alarm, Siri took the audio). Not 'running', not 'closed'.
export function canResume(state) {
  return state === 'suspended' || state === 'interrupted';
}

// resume() returns a promise that iOS can reject (still interrupted); the next tap tries again.
function resumeQuietly(context) {
  try { Promise.resolve(context.resume()).catch(() => {}); } catch { /* stays quiet */ }
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
      // Every tap or key: cheap when already running, and the first touch after a call or the background starts it again.
      if (document.visibilityState === 'visible' && canResume(context.state)) resumeQuietly(context);
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

  // The app going to the background and coming back (app-shell.js; its WebView may not report visibility).
  function sleep() {
    try { Promise.resolve(context?.suspend()).catch(() => {}); } catch { /* nothing to stop */ }
  }
  function wake() {
    if (context && canResume(context.state)) resumeQuietly(context);
  }

  // Hidden tabs (and portal frames scrolled away) go quiet.
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.visibilityState === 'hidden') Promise.resolve(context.suspend()).catch(() => {});
    else resumeQuietly(context);
  });

  return {
    unlock, play,
    sleep, wake,
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
