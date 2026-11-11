import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../game.js';

test('net height is selected at match start and survives rallies', t => {
  for (const [roll, expected] of [[0.05, 342], [0.45, 321], [0.85, 300]]) {
    t.mock.method(Math, 'random', () => roll);
    const game = createGame();
    game.restart(3);
    assert.equal(game.view().netTop, expected);
    for (let i = 0; i < 900; i++) {
      game.simulate(step);
      assert.equal(game.view().netTop, expected);
    }
    t.mock.restoreAll();
  }
});

test('explicit CPU levels survive restarts and random remains available', t => {
  t.mock.method(Math, 'random', () => 0.85);
  const game = createGame({ withCpu: true });
  for (let level = 1; level <= 5; level++) {
    for (let replay = 0; replay < 2; replay++) {
      game.restart(3, level);
      assert.equal(game.view().cpuLevel, level);
      assert.equal(game.view().eventText, '3');
    }
  }
  game.restart(3);
  assert.equal(game.view().cpuLevel, 5);
});

test('the same low shot passes the original net and hits a higher net', t => {
  const results = [];
  for (const netRoll of [0.05, 0.85]) {
    let calls = 0;
    t.mock.method(Math, 'random', () => ++calls === 2 ? netRoll : 0.1);
    const game = createGame();
    game.restart();
    while (game.contactFrame().y < 290) game.simulate(step);
    const frame = game.contactFrame();
    game.moveRacket('left', { x: frame.x - 50, y: frame.y, time: 0 }, frame);
    game.moveRacket('left', { x: frame.x, y: frame.y, time: 20 }, { ...frame, time: 0, age: 0 });
    for (let i = 0; i < 100 && game.view().phase === 'live'; i++) game.simulate(step);
    results.push(game.view().message);
    t.mock.restoreAll();
  }
  assert.deepEqual(results, ['out', 'Net']);
});
