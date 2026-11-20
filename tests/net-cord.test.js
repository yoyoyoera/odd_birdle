import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, netCordBand, step } from '../game.js';
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

test('a shuttle buried in the net is still a fault', () => {
  const { message, touches } = shot(netCordBand + 40);
  assert.equal(message, 'Net');
  assert.equal(touches, 0);
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
  assert.equal(message, 'own court');
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
