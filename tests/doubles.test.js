import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../game.js';

const rules = {
  points: 5, netScale: 1, shuttleShape: 1, shuttleSize: 0,
  doubles: { partner: 3, opponents: [2, 4] }
};

function until(game, condition, ticks = 600) {
  for (let i = 0; i < ticks; i++) {
    const view = game.view();
    if (condition(view)) return view;
    game.simulate(step);
  }
  assert.fail('condition not reached: ' + JSON.stringify(game.view()));
}

function tapShuttle(game) {
  const { x, y } = game.contactFrame();
  game.moveRacket('left', { x, y, time: 0 });
  game.moveRacket('left', null);
}

test('doubles starts with three CPU rackets, A serves, and a second A contact gives the other team a point', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: 'none' } });
  game.restart();
  const start = game.view();
  assert.deepEqual(start.turn, { left: 'left', right: 'right' });
  assert.ok(start.leftB && start.right && start.rightB);
  tapShuttle(game);
  assert.equal(game.view().lastPlayer, 'left');
  assert.deepEqual(game.view().turn, { left: 'leftB', right: 'right' });
  for (let i = 0; i < 18; i++) game.simulate(step);
  tapShuttle(game);
  assert.equal(game.view().message, 'wrong partner');
  assert.equal(game.view().eventText, 'FOUL');
  assert.deepEqual(game.view().score, { left: 0, right: 1 });
  const serve = until(game, view => view.message === 'right serve');
  assert.deepEqual(serve.turn, start.turn);
  assert.equal(serve.eventText, '');
  assert.equal(serve.lastPlayer, undefined);
  until(game, view => view.lastPlayer === 'right');
  assert.equal(game.view().turn.right, 'rightB');
  game.restart(0, 2, null);
  assert.equal(game.view().rightB, undefined);
  assert.equal(game.view().turn, undefined);
});

test('one sweep and its immediate follow-through do not become a wrong-partner fault', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: 'none' } });
  game.restart();
  const { x, y } = game.contactFrame();
  // A swept strike can touch even when neither pointer sample overlaps the shuttle.
  game.moveRacket('left', { x: x - 55, y, time: 0 });
  game.moveRacket('left', { x: x + 55, y, time: 100 });
  assert.equal(game.view().lastPlayer, 'left');
  assert.equal(game.view().turn.left, 'leftB');
  game.moveRacket('left', { x: x + 28, y, time: 108 });
  assert.deepEqual(game.view().score, { left: 0, right: 0 });

  // Touch capture may release the racket and send another sample within the same hit window.
  game.moveRacket('left', null);
  game.moveRacket('left', { x, y, time: 115 });
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
  assert.equal(game.view().phase, 'live');
});

test('overlap acquired during the hit window stays a single contact after the window closes', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: 'none' } });
  game.restart();
  tapShuttle(game);
  const { x, y } = game.contactFrame();
  game.moveRacket('left', { x, y, time: 10 });
  for (let i = 0; i < 18; i++) game.simulate(step);
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
  game.moveRacket('left', null);
  tapShuttle(game);
  assert.equal(game.view().fault, 'left');
});

test('SHOCK does not change the last player or either turn', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: ['shock'] } });
  game.restart();
  tapShuttle(game);
  assert.ok(game.triggerEffect('shock'));
  game.simulate(step);
  assert.deepEqual(game.view().turn, { left: 'leftB', right: 'right' });
  assert.equal(game.view().lastPlayer, 'left');
});

test('a real bumper bounce preserves the waiting partner’s turn', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: ['bumper'] } });
  game.restart();
  assert.ok(game.triggerEffect('bumper'));
  const { shuttle } = until(game, view => view.shuttle.y > 236);
  game.moveRacket('left', { x: shuttle.x - 36, y: shuttle.y + 28, time: 0 });
  game.moveRacket('left', { x: shuttle.x, y: shuttle.y, time: 66 });
  game.moveRacket('left', null);
  const bounce = until(game, view => view.bumper?.ring > 0);
  assert.deepEqual(bounce.turn, { left: 'leftB', right: 'right' });
  assert.equal(bounce.lastPlayer, 'left');
});

test('a trampoline return does not count as the first serve hit', () => {
  const game = createGame({ withCpu: true, rules: { ...rules, effects: ['trampoline'] } });
  game.restart();
  assert.ok(game.triggerEffect('trampoline'));
  const press = until(game, view => view.trampoline?.press);
  const bounce = until(game, view => view.trampoline?.press?.age > 0.1);
  assert.deepEqual(bounce.turn, press.turn);
  assert.equal(bounce.lastPlayer, undefined);
  assert.deepEqual(bounce.score, { left: 0, right: 0 });
});

test('all four rackets alternate in real rallies without the waiting partner making contact', async t => {
  const { simulateStage, makePlayer } = await import('../tools/stage-difficulty.mjs');
  // Enough time for several points and thousands of collision checks with the three CPUs.
  const stage = { id: 8, rules: { ...rules, effects: 'none' } };
  const match = simulateStage(stage, { seed: 20261127, maxSeconds: 120 });
  assert.equal(match.turnFaults.leftB, 0);

  t.mock.method(Math, 'random', () => 0.5);
  const game = createGame({ withCpu: true, rules: stage.rules });
  game.restart();
  const play = makePlayer(() => 0.5, stage.rules);
  const hitters = new Set();
  let lastPlayer;
  for (let i = 0; i < 2400; i++) {
    play(game, i * step);
    game.simulate(step);
    const view = game.view();
    if (view.lastPlayer !== lastPlayer && view.lastPlayer) {
      hitters.add(view.lastPlayer);
      const team = view.lastPlayer.startsWith('left') ? 'left' : 'right';
      assert.notEqual(view.turn[team], view.lastPlayer);
    }
    lastPlayer = view.lastPlayer;
  }
  assert.deepEqual(hitters, new Set(['left', 'right', 'leftB', 'rightB']));
});
