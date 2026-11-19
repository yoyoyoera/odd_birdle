import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, shapeCount, floor, netTop, projectStrike, bumperSpot } from '../game.js';

const run = (game, seconds) => {
  for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step);
};

// A repeatable vertical lob keeps a real rally alive while its effect clocks run.
function lobTick(game) {
  const frame = game.contactFrame();
  if (frame?.canHit && frame.y > 250 && frame.x < 450) {
    game.moveRacket('left', null);
    game.moveRacket('left', { x: frame.x, y: frame.y + 80, time: 0 }, frame);
    game.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, { ...frame, time: 0, age: 0 });
    game.moveRacket('left', null);
  }
  game.simulate(step);
}

const plainRules = { points: 5, cpuLevel: 4, effects: 'none', netScale: 1, shuttleShape: 1, shuttleSize: 1 };

test('a stage fixes its score, target and CPU; the very next lost point ends Five in a Row', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ withCpu: true, rules: { ...plainRules, startScore: { left: 0, right: 4 } } });
  game.restart(3, 1);
  assert.equal(game.view().cpuLevel, 4, 'stage CPU overrides practice selection');
  assert.deepEqual(game.view().score, { left: 0, right: 4 });
  assert.equal(game.view().pointsToWin, 5);
  assert.equal(game.view().eventText, '3');
  run(game, 5);
  assert.equal(game.view().phase, 'finished');
  assert.equal(game.view().winner, 'right');
  assert.deepEqual(game.view().score, { left: 0, right: 5 });
  game.restart();
  assert.deepEqual(game.view().score, { left: 0, right: 4 }, 'retry restores the handicap');
});

test('Sudden Death ends after one point and a winning handicap finishes at the exact target', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ rules: { ...plainRules, points: 1 } });
  game.restart();
  run(game, 2);
  assert.equal(game.view().phase, 'finished');
  assert.deepEqual(game.view().score, { left: 0, right: 1 });
  game.restart(0, undefined, { ...plainRules, startScore: { left: 4, right: 0 } });
  // A clean, straight strike lands in the unattended opponent's court.
  run(game, 0.5);
  const frame = { ...game.contactFrame(), time: 100, age: 0 };
  game.moveRacket('left', { x: frame.x - 30, y: frame.y + 55, time: 0 }, frame);
  game.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, frame);
  game.moveRacket('left', null);
  run(game, 3);
  assert.equal(game.view().winner, 'left');
  assert.deepEqual(game.view().score, { left: 5, right: 0 });
});

test('stage shape, size and net baseline survive serves, then practice explicitly releases every rule', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ withCpu: true });
  game.restart(0, undefined, { ...plainRules, shuttleShape: shapeCount - 1, shuttleSize: 0, netScale: 'high' });
  const expectedNet = Math.round(floor - (floor - netTop) * 1.4);
  for (let i = 0; i < 900; i++) {
    const view = game.view();
    assert.equal(view.netTop, expectedNet);
    if (view.shuttle) {
      assert.equal(view.shuttle.shape, shapeCount - 1);
      assert.equal(view.shuttle.baseSize, 11);
    }
    game.simulate(step);
  }
  game.restart(0, 2, undefined);
  assert.equal(game.view().pointsToWin, undefined, 'practice retains its existing view contract');
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
  assert.equal(game.view().cpuLevel, 2);
  assert.notEqual(game.view().shuttle.baseSize, 11);
  assert.ok(game.triggerEffect('invisible'), 'practice test overrides remain available');
});

test('none and an empty/retired-only stage pool never create effects', t => {
  t.mock.method(Math, 'random', () => 0.5);
  for (const effects of ['none', [], ['freeze', 'invisible', 'not-an-effect']]) {
    const game = createGame({ rules: { ...plainRules, effects, quickEvents: true } });
    game.restart();
    assert.equal(game.triggerEffect('wind'), false);
    assert.equal(game.triggerEffect('freeze'), false);
    for (let i = 0; i < 120 * 15; i++) {
      lobTick(game);
      assert.equal(game.view().effect, undefined);
    }
  }
});

test('an allowed stage pool controls random effects and effectRate halves the time until an effect', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const started = [];
  for (const effectRate of [1, 2]) {
    const game = createGame({ rules: { ...plainRules, effects: ['highNet'], effectRate } });
    game.restart();
    assert.equal(game.triggerEffect('wind'), false);
    for (let tick = 0; tick < 1600; tick++) {
      lobTick(game);
      if (game.view().effect) { started.push(tick * step); break; }
    }
    assert.equal(game.view().effect, 'highNet');
  }
  assert.ok(started[0] - started[1] > 3.9 && started[0] - started[1] < 4.1, `start seconds: ${started}`);
});

test('Effect Storm changes effects every 1–2 live seconds, without a three-second warning', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ rules: { ...plainRules, effects: ['wind'], quickEvents: true } });
  game.restart();
  const starts = [];
  let previousElapsed;
  for (let tick = 0; tick < 120 * 10; tick++) {
    lobTick(game);
    const elapsed = game.view().force?.elapsed;
    if (elapsed !== undefined && (previousElapsed === undefined || elapsed < previousElapsed)) starts.push(tick * step);
    previousElapsed = elapsed;
    assert.doesNotMatch(game.view().eventText, /^[123]$/);
  }
  assert.ok(starts.length >= 4, `starts: ${starts}`);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] - starts[i - 1] >= 1 - step && starts[i] - starts[i - 1] <= 2 + step);
  }
});

test('a permanent bumper grows once, collides, and survives effects and point boundaries', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ rules: { ...plainRules, permanent: 'bumper', effects: ['wind'] } });
  game.restart();
  assert.equal(game.view().bumper.size, 0);
  run(game, 0.45);
  assert.equal(game.view().bumper.size, 1);
  while (game.view().shuttle.y < bumperSpot.y - 6) run(game, step);
  const frame = { ...game.contactFrame(), time: 100, age: 0 };
  game.moveRacket('left', { x: frame.x - 60, y: frame.y, time: 0 }, frame);
  game.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, frame);
  game.moveRacket('left', null);
  let ring = 0;
  for (let i = 0; i < 120; i++) {
    run(game, step);
    ring = Math.max(ring, game.view().bumper.ring);
  }
  assert.ok(ring > 0.9, 'the permanent post actually reflects the shuttle');
  game.restart();
  run(game, 0.5);
  assert.ok(game.triggerEffect('wind'));
  assert.equal(game.view().effect, 'wind');
  assert.equal(game.view().bumper.size, 1, 'wind and the post coexist');
  for (let i = 0; i < 120 * 8; i++) {
    game.simulate(step);
    assert.equal(game.view().bumper.size, 1, 'the post stays through point transitions');
  }
  game.restart(0, undefined, null);
  assert.equal(game.view().bumper, undefined);
});

test('low gravity affects serve flight and uses the same gravity for strike replay', t => {
  t.mock.method(Math, 'random', () => 0.5);
  const normal = createGame({ rules: plainRules });
  const moon = createGame({ rules: { ...plainRules, gravityScale: 0.6 } });
  normal.restart(); moon.restart();
  run(normal, 0.5); run(moon, 0.5);
  assert.ok(moon.view().shuttle.y < normal.view().shuttle.y - 20);
  assert.equal(moon.view().shuttle.gravityScale, 0.6);
  const frame = { ...moon.contactFrame(), time: 100, age: 0 };
  moon.moveRacket('left', { x: frame.x - 30, y: frame.y + 55, time: 0 }, frame);
  moon.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, frame);
  moon.moveRacket('left', null);
  const { strike } = moon.view();
  assert.ok(strike);
  run(moon, 0.5);
  const replay = projectStrike(strike.pose, strike.motion, 0.5, strike.force);
  const live = moon.view().shuttle;
  assert.ok(Math.hypot(live.x - replay.x, live.y - replay.y) < 1e-6);
});
