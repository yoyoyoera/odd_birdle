import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../playback.js';

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
