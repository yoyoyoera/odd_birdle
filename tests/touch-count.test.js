import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, threeTouchLimit, sameRacketGap } from '../game.js';

function makeGame() {
  const game = createGame({ withCpu: false, touchLimit: threeTouchLimit });
  game.setEffects(false);
  game.setShuttle({ shape: 0, size: 0 });
  game.restart(0, 4, null, { touchLimit: threeTouchLimit });
  return game;
}
const advance = (game, frames) => { for (let i = 0; i < frames; i++) game.simulate(step); };
const flight = game => game.view().shuttle.flight;
function swing(game, time) {
  const frame = { ...game.contactFrame(), time };
  game.moveRacket('left', { x: frame.x, y: frame.y, time }, frame);
}

test('a racket staying on the shuttle after a hit is still one touch', () => {
  const game = makeGame();
  game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'right' });
  swing(game, 0);
  const counted = flight(game);
  assert.equal(game.view().shuttle.touchLimitReachedFor, undefined);
  // The racket keeps following the shuttle around for a good while.
  for (let i = 0; i < 30; i++) {
    swing(game, 8 * (i + 1));
    game.simulate(step);
  }
  assert.equal(flight(game), counted);
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
});

test('the same racket cannot touch again inside the minimum gap, even after leaving and returning', () => {
  const game = makeGame();
  game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'right' });
  swing(game, 0);
  const counted = flight(game);
  const gapFrames = Math.floor(sameRacketGap / step);
  for (let i = 0; i < gapFrames - 2; i++) {
    game.moveRacket('left', null);
    game.simulate(step);
    assert.equal(game.view().shuttle.locked?.left, true);
  }
  assert.equal(flight(game), counted);
});

test('after the shuttle has separated and the gap has passed, a new hit counts as touch 2, and the fourth is a fault', () => {
  const game = makeGame();
  game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'right' });
  for (let touch = 1; touch <= 3; touch++) {
    const before = flight(game);
    game.moveRacket('left', null);
    swing(game, touch * 400);
    assert.equal(flight(game), before + 1, `touch ${touch} counts`);
    game.moveRacket('left', null);
    advance(game, 40);
    assert.equal(game.view().shuttle.locked?.left, undefined);
    game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'left' });
  }
  assert.equal(game.view().shuttle.touchLimitReachedFor, 'left');
});

test("the other racket's hit clears the lock", () => {
  const game = makeGame();
  game.testShot({ x: 237, y: 250, vx: 0, vy: 0, hitter: 'right' });
  swing(game, 0);
  assert.equal(game.view().shuttle.locked?.left, true);
  game.testShot({ x: 660, y: 250, vx: 0, vy: 0, hitter: 'left' });
  assert.equal(game.view().shuttle.locked?.left, undefined);
});

test('a shuttle that keeps bouncing on a still racket is hit again each time it drops back', () => {
  const game = createGame({ withCpu: false });
  game.setEffects(false);
  game.setShuttle({ shape: 0, size: 0 });
  game.restart(0, 4);
  game.testShot({ x: 237, y: 300, vx: 0, vy: 0, hitter: 'right' });
  const start = flight(game);
  let time = 0;
  for (let i = 0; i < 120 * 4; i++) {
    const frame = game.contactFrame();
    time += 8;
    // The racket sits still under where the shuttle falls and is jabbed up through it when it arrives.
    if (frame?.canHit && frame.y > 290 && frame.y < 330) {
      game.moveRacket('left', { x: 237, y: 300 + 20, time: time - 16 }, frame);
      game.moveRacket('left', { x: 237, y: 300 - 4, time }, frame);
    } else game.moveRacket('left', { x: 237, y: 330, time }, frame);
    game.simulate(step);
  }
  assert.ok(flight(game) - start >= 3, `only ${flight(game) - start} hits`);
});
