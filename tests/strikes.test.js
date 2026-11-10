import test from 'node:test';
import assert from 'node:assert/strict';
import { contactMotion, createGame, step } from '../game.js';
import { followStrikeClock } from '../playback.js';

test('CPU and online give the same immediate shot to slow and fast swipes', t => {
  t.mock.method(Math, 'random', () => 0.1);
  for (const duration of [400, 25]) {
    const results = [true, false].map(withCpu => {
      const game = createGame({ withCpu });
      game.restart();
      const frame = game.contactFrame();
      game.moveRacket('left', { x: frame.x - 35, y: frame.y, time: 0 }, frame);
      game.moveRacket('left', { x: frame.x, y: frame.y, time: duration }, frame);
      assert.equal(game.contactFrame().flight, frame.flight + 1);
      game.moveRacket('left', null);
      for (let i = 0; i < 4; i++) game.simulate(step);
      return game.contactFrame();
    });
    assert.deepEqual(results[0], results[1]);
  }
});

test('held contact tapers swing momentum instead of dropping it abruptly', () => {
  const racket = { time: 100, vx: 800, vy: -400 };
  assert.deepEqual(contactMotion(racket, 142.5), { vx: 400, vy: -200 });
  assert.equal(Math.hypot(...Object.values(contactMotion(racket, 185))), 0);
});

test('confirmed flight converges to the playback clock from either direction without rewinding', () => {
  for (const delay of [-100, 100]) {
    let age = 140;
    for (let elapsed = 10; elapsed <= 250; elapsed += 10) {
      const next = followStrikeClock(age, 140 + delay + elapsed, 10);
      assert.ok(next - age >= 5 && next - age <= 15);
      age = next;
    }
    assert.equal(age, 390 + delay);
  }
});
