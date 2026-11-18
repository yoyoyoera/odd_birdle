import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, effectIds, trialEffectIds, step, bumperSpot, floor, center, trampolineLift, trampolineDent,
  trampolineDentDepth, trampolineHoldSeconds
} from '../game.js';

const run = (game, seconds) => { for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step); };

function serve(t, { shape = 5 } = {}) {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ withCpu: false });
  game.setShuttle({ shape, size: 1 });
  game.restart(0);
  return game;
}

// Hits the shuttle the way rooms replay a swing: a quick pass from (dx, dy) behind it to its centre.
function hit(game, { dx = -40, dy = 0 } = {}) {
  const frame = { ...game.contactFrame(), time: 100, age: 0 };
  game.moveRacket('left', { x: frame.x + dx, y: frame.y + dy, time: 0 }, frame);
  game.moveRacket('left', { x: frame.x, y: frame.y, time: 25 }, frame);
  game.moveRacket('left', null);
  return game.view().shuttle;
}

test('trial effects are not part of the live random pool', () => {
  assert.deepEqual(trialEffectIds, ['bumper', 'decoy', 'trampoline']);
  for (const id of trialEffectIds) assert.ok(!effectIds.includes(id));
  const game = createGame({ withCpu: true, quickEvents: true });
  game.restart(3, 4);
  const seen = new Set();
  for (let i = 0; i < 120 * 300; i++) {
    game.moveRacket('left', { x: 300 + Math.sin(i / 90) * 120, y: 380, time: i * 8 });
    game.simulate(step);
    const effect = game.view().effect;
    if (effect) seen.add(effect);
    if (game.view().phase === 'finished') game.restart(3, 4);
  }
  for (const id of trialEffectIds) assert.ok(!seen.has(id), `${id} showed up at random`);
});

test('a pinned trial effect is the only one that comes up, and can be asked for by name', t => {
  const game = serve(t);
  assert.ok(game.triggerEffect('bumper'));
  assert.equal(game.view().effect, 'bumper');
  assert.match(game.view().eventText, /BUMPER/);
  const pinned = createGame({ withCpu: true, quickEvents: true });
  pinned.setOnlyEffect('trampoline');
  pinned.restart(3, 4);
  const seen = new Set();
  for (let i = 0; i < 120 * 200; i++) {
    pinned.moveRacket('left', { x: 300 + Math.sin(i / 90) * 120, y: 380, time: i * 8 });
    pinned.simulate(step);
    if (pinned.view().effect) seen.add(pinned.view().effect);
    if (pinned.view().phase === 'finished') pinned.restart(3, 4);
  }
  assert.deepEqual([...seen], ['trampoline']);
});

test('BUMPER grows in, stays fixed above the middle of the court, and goes away', t => {
  const game = serve(t);
  game.triggerEffect('bumper');
  assert.equal(game.view().bumper.size, 0);
  run(game, 0.5);
  const post = game.view().bumper;
  assert.equal(post.size, 1);
  assert.equal(post.x, center);
  assert.ok(post.y < 200 && post.y > 100, 'in the upper middle');
  run(game, 0.3);
  assert.deepEqual([game.view().bumper.x, game.view().bumper.y], [post.x, post.y], 'it does not move');
  run(game, 6);
  assert.equal(game.view().bumper, undefined);
});

test('BUMPER throws the shuttle back with a ring (it is the hitter\'s problem if it lands on their own side)', t => {
  const game = serve(t);
  game.triggerEffect('bumper');
  run(game, 0.45);
  // Wait for the shuttle to fall to the post's height, then smash it straight at the post.
  while (game.view().shuttle.y < bumperSpot.y - 6) run(game, step);
  hit(game, { dx: -60 });
  let furthest = 0;
  let ring = 0;
  let returned = false;
  for (let i = 0; i < 120 && game.view().phase === 'live'; i++) {
    run(game, step);
    const shuttle = game.view().shuttle;
    furthest = Math.max(furthest, shuttle.x);
    ring = Math.max(ring, game.view().bumper?.ring ?? 0);
    if (furthest > 300 && shuttle.x < furthest - 25) returned = true;
  }
  assert.ok(ring > 0.9, 'a ring shows when it bounces');
  assert.ok(returned, `it came back (furthest ${furthest.toFixed(0)})`);
  assert.ok(furthest < center + 30, 'it did not pass through the post');
  assert.notEqual(game.view().message, 'Net', 'the post is not the net');
});

test('DECOY splits off two fakes, one flying higher and one lower, and the real one flies on unchanged', t => {
  const plain = serve(t);
  plain.triggerEffect('wind'); // placeholder so both games consume the same randomness
  const game = serve(t);
  const baseline = serve(t);
  game.triggerEffect('decoy');
  const { decoys } = game.view();
  assert.equal(decoys.length, 2);
  run(game, 0.4);
  run(baseline, 0.4);
  const real = game.view().shuttle;
  assert.ok(Math.abs(real.y - baseline.view().shuttle.y) < 1e-6, 'the real shuttle is not affected');
  const [a, b] = game.view().decoys;
  const heights = [a.y, b.y].sort((p, q) => p - q);
  assert.ok(heights[0] < real.y - 5 && heights[1] > real.y + 5, `fakes ${heights} around ${real.y}`);
});

test('a fake bursts when a racket touches it, and the real shuttle is not touched', t => {
  const game = serve(t);
  game.triggerEffect('decoy');
  run(game, 0.15);
  const target = game.view().decoys[0];
  game.moveRacket('left', { x: target.x - 30, y: target.y, time: 0 });
  game.moveRacket('left', { x: target.x, y: target.y, time: 20 });
  assert.equal(game.view().decoys?.length, 1, 'one fake is left');
  assert.equal(game.view().pops?.length, 1, 'the burst is shown');
  assert.ok(game.view().shuttle, 'the real shuttle is still there');
  assert.equal(game.view().phase, 'live');
  run(game, 0.6);
  assert.equal(game.view().pops, undefined, 'the burst fades away');
});

test('fakes burst on landing and do not decide the point', t => {
  const game = serve(t);
  game.triggerEffect('decoy');
  run(game, 3.5);
  assert.equal(game.view().decoys, undefined);
  assert.equal(game.view().effect, undefined);
});

test('TRAMPOLINE swells the floor, throws the first landing back up and does not score it', t => {
  const game = serve(t);
  game.triggerEffect('trampoline');
  run(game, 0.5);
  assert.equal(game.view().trampoline.swell, 1);
  assert.ok(trampolineLift(245, 1) > 8, 'a dome on the left half');
  assert.ok(trampolineLift(660, 1) > 8, 'and on the right half');
  assert.equal(trampolineLift(center, 1), 0, 'flat at the net');
  let lowest = 0;
  let bounced = false;
  let score;
  for (let i = 0; i < 120 * 3; i++) {
    run(game, step);
    const view = game.view();
    if (!view.shuttle) break;
    if (view.shuttle.y > lowest) lowest = view.shuttle.y;
    if (lowest > 380 && view.shuttle.y < lowest - 120) { bounced = true; score = view.score; break; }
  }
  assert.ok(bounced, 'it came back up');
  assert.deepEqual(score, { left: 0, right: 0 });
  assert.equal(game.view().phase, 'live');
  assert.ok(game.view().trampoline.press, 'the floor shows where it was pressed');
  // The bounce is used up: after it settles the next landing is an ordinary point.
  run(game, 4);
  assert.ok(game.view().score.left + game.view().score.right >= 1 || game.view().phase !== 'live');
});

test('the dent presses in, springs back past rest, and settles', () => {
  assert.equal(trampolineDent(0), 0);
  assert.ok(Math.abs(trampolineDent(trampolineHoldSeconds) - trampolineDentDepth) < 1e-9);
  const springs = Array.from({ length: 40 }, (_, i) => trampolineDent(trampolineHoldSeconds + i * 0.01));
  assert.ok(Math.min(...springs) < 0, 'it overshoots upward');
  assert.ok(Math.abs(trampolineDent(1)) < 0.2, 'then settles');
});
