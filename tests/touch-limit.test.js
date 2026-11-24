import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, threeTouchLimit, touchLimitFault } from '../game.js';

function makeGame(options) {
  const game = createGame(options);
  game.setEffects(false);
  game.setShuttle({ shape: 0, size: 0 });
  game.restart(0, 4);
  return game;
}

function tap(game, side, number) {
  const frame = { ...game.contactFrame(), time: number * 200 };
  assert.equal(frame.canHit, true);
  game.moveRacket(side, { x: frame.x, y: frame.y, time: frame.time }, frame);
  game.moveRacket(side, null);
  return frame.flight;
}

const advance = (game, frames) => {
  for (let i = 0; i < frames; i++) game.simulate(step);
};

for (const withCpu of [false, true]) {
  test(`${withCpu ? 'CPU match' : 'server game'}: hit four scores a single point against the hitter`, () => {
    const game = makeGame({ withCpu, touchLimit: threeTouchLimit });
    game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'right' });
    for (let touch = 1; touch <= threeTouchLimit; touch++) {
      const previousFlight = tap(game, 'left', touch);
      assert.equal(game.view().shuttle.flight, previousFlight + 1);
      assert.deepEqual(game.view().score, { left: 0, right: 0 });
      advance(game, 21);
    }
    assert.equal(game.view().shuttle.touchLimitReachedFor, 'left');
    const previousFlight = tap(game, 'left', 4);
    assert.equal(game.view().shuttle.flight, previousFlight);
    assert.equal(game.view().phase, 'between');
    assert.equal(game.view().eventText, touchLimitFault);
    assert.deepEqual(game.view().score, { left: 0, right: 1 });
    advance(game, 104);
    assert.equal(game.view().phase, 'live');
    assert.equal(game.view().shuttle.touchLimitReachedFor, undefined);
    assert.deepEqual(game.view().score, { left: 0, right: 1 });
  });
}

test('an unlimited game still accepts a fourth hit', () => {
  const game = makeGame();
  game.testShot({ x: 660, y: 250, vx: 0, vy: 0, hitter: 'left' });
  for (let touch = 1; touch <= 4; touch++) {
    const previousFlight = tap(game, 'right', touch);
    assert.equal(game.view().shuttle.flight, previousFlight + 1);
    assert.deepEqual(game.view().score, { left: 0, right: 0 });
    advance(game, 21);
  }
});

test('the opponent can return the third shot and reset the touch count', () => {
  const game = makeGame({ touchLimit: threeTouchLimit });
  game.testShot({ x: 237, y: 250, vx: 0, vy: 0 });
  for (let touch = 1; touch <= 2; touch++) {
    tap(game, 'left', touch);
    advance(game, 21);
  }
  const frame = game.contactFrame();
  game.moveRacket('left', { x: frame.x - 48, y: frame.y + 49, time: 600 }, frame);
  game.moveRacket('left', { x: frame.x, y: frame.y, time: 670 }, frame);
  game.moveRacket('left', null);
  assert.equal(game.view().shuttle.touchLimitReachedFor, 'left');
  advance(game, 55);
  assert.ok(game.contactFrame().x >= 490);
  tap(game, 'right', 7);
  assert.equal(game.view().shuttle.touchLimitReachedFor, undefined);
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
});

test('CPU Lv.4 and Lv.5 can finish their setup and return within the touch budget', t => {
  t.mock.method(Math, 'random', () => 0.09);
  for (const [level, expectedHits] of [[4, 2], [5, 3]]) {
    const game = makeGame({ withCpu: true, touchLimit: threeTouchLimit });
    game.restart(0, level);
    game.testShot({ x: 655, y: 275, vx: 0, vy: 140, hitter: 'left' });
    const initialFlight = game.contactFrame().flight;
    for (let tick = 0; tick < 400 && game.view().phase === 'live'; tick++) game.simulate(step);
    const view = game.view();
    assert.equal(view.shuttle.flight - initialFlight, expectedHits, `Lv.${level} consecutive shots`);
    assert.deepEqual(view.score, { left: 0, right: 1 });
  }
});
