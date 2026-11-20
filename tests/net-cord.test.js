import test from 'node:test';
import assert from 'node:assert/strict';
import { center, createGame, netCordBand, netPart, step, tapeDepth, tapeHalfWidth } from '../game.js';
import { createCueTracker } from '../sound-cues.js';
import { createCrowd } from '../crowd.js';

// Sends the shuttle from the left at the tape, `depth` units below its top, and plays the rally out.
function shot(depth, roll) {
  const real = Math.random;
  if (roll !== undefined) Math.random = () => roll;
  try {
    const game = createGame({ withCpu: true });
    game.restart(0, 1);
    game.setEffects(false);
    for (let i = 0; i < 20; i++) game.simulate(step);
    assert.ok(game.testNetCord(depth));
    let touches = 0;
    let cpuHit = false;
    for (let i = 0; i < 1200 && game.view().phase === 'live'; i++) {
      game.simulate(step);
      touches = game.view().cord.count;
      if (game.view().flash > 0.2) { cpuHit = true; break; }
    }
    return { game, touches, cpuHit, message: game.view().message };
  } finally {
    Math.random = real;
  }
}

// A small square shuttle (10 x 10) with its middle at x, y.
const square = [[{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }]];

test('the net is hit where it is drawn: the tape bar across the top, the thin post under it', () => {
  const top = 342;
  // Just over the tape, and just off its end: nothing.
  assert.equal(netPart(top, center, top - 6, square), undefined);
  assert.equal(netPart(top, center - tapeHalfWidth - 6, top + 2, square), undefined);
  // On the tape, including the part that sticks out past the post.
  assert.equal(netPart(top, center, top - 4, square), 'tape');
  assert.equal(netPart(top, center - tapeHalfWidth - 4, top + 2, square), 'tape');
  // Below the tape: the post, and only the post's own width.
  assert.equal(netPart(top, center - 6, top + tapeDepth + 20, square), 'post');
  assert.equal(netPart(top, center - 8, top + tapeDepth + 20, square), undefined);
});

test('a shuttle driven into the net below the tape is still a fault', () => {
  for (let k = 0; k < 10; k++) assert.equal(shot(netCordBand + 70).message, 'Net');
});

test('clipping the tape plays on: over, it is the other side\'s shuttle (the CPU goes for it)', () => {
  let over = 0;
  for (let k = 0; k < 20; k++) {
    const { touches, cpuHit, message } = shot(4, 0.1);
    if (touches > 0 && (cpuHit || message === 'Landed')) over++;
  }
  assert.ok(over >= 15, `rolled over the tape ${over}/20 times`);
});

test('a clip that drops back loses the point for the hitter, and a shuttle never hangs on the tape', () => {
  // A roll of 0.9 sends a first touch back towards the hitter.
  const { game, touches, message } = shot(4, 0.9);
  assert.ok(touches >= 1 && touches <= 4, `touches ${touches}`);
  assert.equal(message, 'Net', 'back on its own side off the net');
  assert.deepEqual(game.view().score, { left: 0, right: 1 });
});

test('a tape clip makes a tick and the crowd goes "ooh"', () => {
  const cues = createCueTracker();
  const crowd = createCrowd();
  const base = { phase: 'live', score: { left: 0, right: 0 }, flash: 0, eventText: '' };
  cues.cues({ ...base, cord: { count: 0 } }, 0);
  crowd.update({ ...base, cord: { count: 0 } }, [], 0);
  assert.ok(cues.cues({ ...base, cord: { count: 1 } }, 100).includes('cord'));
  const after = crowd.update({ ...base, cord: { count: 1 } }, [], 100);
  assert.ok(after.cues.includes('ooh'));
  assert.ok(after.mood.surprise > 0.9);
  assert.ok(!crowd.update({ ...base, cord: { count: 1 } }, [], 200).cues.includes('ooh'), 'only once per clip');
});
