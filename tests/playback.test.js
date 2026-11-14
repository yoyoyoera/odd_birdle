import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../playback.js';
import { projectStrike } from '../game.js';

const state = (x, seenTime, extra = {}) => ({
  phase: 'live', right: { x, y: 200, seenTime }, ...extra
});

test('remote racket uses the contact scene clock instead of server receipt time', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live' }, 0);
  playback.push(100, state(600, 20), 100);
  playback.push(120, state(620, 40), 120);
  // The shuttle scene is at 30ms. The racket must also be at 30ms.
  assert.equal(playback.at(100).right.x, 610);
});

test('late stationary packets do not make the remote racket overshoot and recoil', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live' }, 0);
  playback.push(100, state(600, 20), 100);
  playback.push(120, state(620, 40), 120);
  assert.equal(playback.at(130).right.x, 620);
  assert.equal(playback.at(170).right.x, 620);
  playback.push(180, state(620, 100), 180);
  assert.equal(playback.at(200).right.x, 620);
});

test('same-tick immediate hit replaces an existing snapshot', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live' }, 0);
  playback.push(100, state(600, 20), 100);
  playback.push(100, state(630, 30, { flash: 1 }), 102);
  assert.equal(playback.at(200).flash, 1);
  playback.push(90, state(800, 90, { flash: 0 }), 103);
  assert.equal(playback.at(210).flash, 1);
});

test('reset clears the opponent and old timing', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live' }, 0);
  playback.push(100, state(600, 20), 100);
  playback.reset();
  assert.equal(playback.at(200), undefined);
  playback.push(0, { phase: 'starting' }, 1000);
  assert.equal(playback.at(1100).right, undefined);
});

test('confirmed contact anchors racket and shuttle to the same instant', () => {
  const playback = createPlayback();
  const shuttle = { x: 700, y: 200, shape: 1, size: 11, baseSize: 11, angle: 0, flight: 1 };
  playback.push(0, { phase: 'live', shuttle }, 0);
  playback.push(100, state(690, 20, { shuttle }), 100);
  playback.push(120, state(710, 40, {
    shuttle: { ...shuttle, flight: 2 },
    strike: { flight: 2, fromFlight: 1, time: 40, side: 'right',
      racket: { x: 710, y: 200 }, pose: shuttle, motion: { vx: -300, vy: -400 } }
  }), 120);
  const contact = playback.at(110);
  assert.equal(contact.right.x, 710);
  assert.equal(contact.shuttle.x, 700);
  assert.equal(contact.shuttle.y, 200);
  assert.equal(contact.shuttle.flight, 2);
});

test('racket removal and reentry retain the scene clock', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live' }, 0);
  playback.push(100, state(600, 20), 100);
  playback.push(120, { phase: 'live' }, 120);
  assert.equal(playback.at(120).right, undefined);
  playback.push(140, state(650, 60), 140);
  assert.equal(playback.at(140).right.x, 650);
});

const bird = (x, y, flight = 1) => ({ x, y, angle: 0, shape: 1, size: 21, baseSize: 21, flight, canHit: true });

function seeded(seed) {
  let value = seed;
  return () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// Server ticks every 16ms; arrivals get Wi-Fi-like jitter but stay in order.
function wifiRun(jitterScale) {
  const random = seeded(3);
  const playback = createPlayback();
  const packets = [];
  let last = 0;
  for (let t = 0; t < 8000; t += 16) {
    const r = random();
    const jitter = r < 0.8 ? random() * 12 : r < 0.95 ? 12 + random() * 30 : r < 0.99 ? 42 + random() * 40 : 82 + random() * 30;
    last = Math.max(last, t + 25 + jitter * jitterScale);
    packets.push({ t, arrival: last, x: 100 + t * 0.3 });
  }
  let next = 0;
  let previous;
  let stalls = 0;
  let biggestJump = 0;
  const buffers = [];
  for (let now = 300; now < 8000; now += 1000 / 60) {
    while (next < packets.length && packets[next].arrival <= now) {
      const { t, arrival, x } = packets[next++];
      playback.push(t, { phase: 'live', shuttle: bird(x, 200) }, arrival);
    }
    const shuttle = playback.at(now)?.shuttle;
    buffers.push(playback.bufferMs);
    if (shuttle && previous?.flight === shuttle.flight) {
      const step = shuttle.x - previous.x;
      if (step < 0.01) stalls++;
      biggestJump = Math.max(biggestJump, step);
    }
    previous = shuttle;
  }
  return { stalls, biggestJump, buffer: buffers.at(-1) };
}

test('jittery arrivals keep the bird moving without stop-and-jump', () => {
  const wifi = wifiRun(1);
  assert.equal(wifi.stalls, 0);
  // 0.3px/ms at 60fps is 5px a frame; allow a little easing on top.
  assert.ok(wifi.biggestJump < 9, `jump ${wifi.biggestJump.toFixed(1)}px`);
});

test('the wait grows with jitter, stays low on a steady link, and has a ceiling', () => {
  const steady = wifiRun(0.1);
  const wifi = wifiRun(1);
  const phone = wifiRun(4);
  assert.ok(steady.buffer <= 55, `steady buffer ${steady.buffer}`);
  assert.ok(wifi.buffer <= 80, `ordinary Wi-Fi stays small: ${wifi.buffer}`);
  assert.ok(phone.buffer > steady.buffer + 40, `a very jittery phone link waits longer: ${phone.buffer}`);
  assert.ok(phone.buffer <= 250);
});

test('growing the wait never slows playback by more than ~12% (the old limit was 60%)', () => {
  const playback = createPlayback();
  const view = { phase: 'live', shuttle: bird(300, 100, 1) };
  // Packets every 16ms, 30ms in transit; from 1.5s on, one in five is held back 220ms.
  const packets = [];
  let last = 0;
  for (let t = 0; t <= 6000; t += 16) {
    last = Math.max(last, t + 30 + (t > 1500 && (t / 16) % 5 === 0 ? 220 : 0));
    packets.push({ t, arrival: last });
  }
  let next = 0;
  let previous;
  let fastestGrowth = 0;
  for (let now = 100; now < 6000; now += 1000 / 60) {
    while (next < packets.length && packets[next].arrival <= now) {
      playback.push(packets[next].t, view, packets[next].arrival);
      next++;
    }
    playback.at(now);
    const { bufferMs } = playback.stats;
    if (previous) fastestGrowth = Math.max(fastestGrowth, (bufferMs - previous.bufferMs) / (now - previous.now));
    previous = { now, bufferMs };
  }
  // Each ms of buffer growth is a ms the display waits: at 0.12 that is playback at 88% speed.
  assert.ok(fastestGrowth <= 0.125, `buffer grew at ${fastestGrowth.toFixed(3)} ms per ms`);
  assert.ok(playback.stats.bufferMs > 100, `the buffer did grow (${Math.round(playback.stats.bufferMs)}ms)`);
  assert.ok(playback.stats.bufferMs <= 250);
});

test('a late packet extends the flight briefly, then eases onto the real position', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live', shuttle: bird(100, 200) }, 0);
  playback.push(16, { phase: 'live', shuttle: bird(110, 200) }, 16);
  playback.push(32, { phase: 'live', shuttle: bird(120, 200) }, 32);
  playback.at(102);
  // No packet after 32ms: the bird keeps going instead of freezing at 120.
  const guessed = playback.at(150);
  assert.ok(guessed.shuttle.x > 120 && guessed.shuttle.x <= 120 + 120 * 10 / 16 + 1e-6);
  // The real data says it slowed down; the drawn bird does not snap back in one frame.
  playback.push(48, { phase: 'live', shuttle: bird(122, 200) }, 160);
  playback.push(64, { phase: 'live', shuttle: bird(124, 200) }, 161);
  const eased = playback.at(166);
  assert.ok(Math.abs(eased.shuttle.x - guessed.shuttle.x) < 20, `${guessed.shuttle.x} -> ${eased.shuttle.x}`);
});

test('a hit by the other player eases the bird onto its new path instead of popping', () => {
  const playback = createPlayback();
  // Falling at 600 px/s towards the hitter.
  for (let t = 0; t <= 300; t += 16) playback.push(t, { phase: 'live', shuttle: bird(300, 200 + 0.6 * t, 1) }, t);
  let last;
  for (let now = 120; now <= 330; now += 16) last = playback.at(now).shuttle;
  // The server now reports a hit: a new flight that is already ~150px above where the old one was drawn.
  const strike = { flight: 2, fromFlight: 1, time: 150, side: 'left', racket: { x: 300, y: 330 },
    pose: { ...bird(300, 330, 1), baseSize: 21 }, motion: { vx: 200, vy: -700 } };
  for (let t = 316; t <= 520; t += 16) {
    // The server flies the hit with the game's own physics.
    const flown = projectStrike(strike.pose, strike.motion, (t - 150) / 1000);
    playback.push(t, { phase: 'live', shuttle: { ...flown, flight: 2, canHit: true }, strike }, t);
  }
  const steps = [];
  for (let now = 340; now <= 560; now += 16) {
    const shuttle = playback.at(now).shuttle;
    steps.push(Math.hypot(shuttle.x - last.x, shuttle.y - last.y));
    last = shuttle;
  }
  assert.ok(Math.max(...steps) < 45, `largest frame step ${Math.max(...steps).toFixed(1)}`);
});

test('a late landing snapshot never draws the bird below the floor', () => {
  const playback = createPlayback();
  // Falling fast; the last snapshot is the first one that has landed (clamped just above the floor).
  for (let t = 0; t <= 336; t += 16) {
    playback.push(t, { phase: 'live', shuttle: bird(500, Math.min(100 + t, 427), 1) }, t);
  }
  let lowest = 0;
  for (let now = 400; now < 700; now += 16) lowest = Math.max(lowest, playback.at(now)?.shuttle?.y ?? 0);
  assert.ok(lowest <= 448, `lowest ${lowest}`);
});
