import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, posesBetween, racketRadius, step, sweptTouch } from '../game.js';

// Online: the server checks the racket against the pose the player saw. A smash at 2000 units/s moves 90 units between
// two of the player's 45 ms checks, more than a still racket is wide, so it used to fly straight through.
function onlineSmash(t, { racketY = 300, since, arrived = 900 } = {}) {
  t.mock.method(Math, 'random', () => 0.3);
  const game = createGame();
  game.restart(0);
  for (let i = 0; i < 5; i++) game.simulate(step);
  const live = game.contactFrame();
  const racket = { x: 250, y: racketY };
  game.moveRacket('left', { ...racket, time: 1000 }, { ...live, time: arrived, age: 0 });
  // The shuttle rushing left, low and flat: 50 units right of the racket, then 50 units left of it 45 ms later.
  const at = time => ({ ...live, x: 300 - (time - 955) * 2, y: 300, canHit: true, time, age: 0.01 });
  const sample = time => (time >= 955 && time <= 1000 ? at(time) : undefined);
  game.holdRacket('left', at(1000), 1000, since === undefined ? sample : time => (time >= since ? sample(time) : undefined));
  return game;
}

test('online: a smash that passes clean through a still racket between two checks is hit', t => {
  const game = onlineSmash(t);
  assert.equal(game.view().message, 'Rally in progress');
  assert.ok(game.view().strike, 'the server struck it back');
});

test('online: without the path, as before, the same smash went through (the bug)', t => {
  t.mock.method(Math, 'random', () => 0.3);
  const game = createGame();
  game.restart(0);
  for (let i = 0; i < 5; i++) game.simulate(step);
  const live = game.contactFrame();
  game.moveRacket('left', { x: 250, y: 300, time: 1000 }, { ...live, time: 900, age: 0 });
  game.holdRacket('left', { ...live, x: 200, y: 300, canHit: true, time: 1000, age: 0.01 }, 1000);
  assert.equal(game.view().strike, undefined);
});

test('online: a racket held well clear of the smash\'s path is not hit (the sweep is not wider than the path)', t => {
  const game = onlineSmash(t, { racketY: 300 + racketRadius + 40 });
  assert.equal(game.view().strike, undefined);
});

test('online: a racket that only just got there is not met by the part of the path the shuttle had already flown', t => {
  // The racket's last check saw the shuttle at 999 ms, when it was already 38 units past: nothing before that counts.
  const game = onlineSmash(t, { arrived: 999 });
  assert.equal(game.view().strike, undefined);
});

test('pure sweep: a still racket across the path is met at the right point, one beside it is not', () => {
  const pose = { shape: 0, size: 11, angle: 0 };
  const path = posesBetween({ ...pose, x: 100, y: 200 }, { ...pose, x: 200, y: 200 });
  const meet = sweptTouch(path, { x: 150, y: 200 }, { x: 150, y: 200 });
  assert.ok(meet > 0 && path[meet].x < 150 && path[meet].x > 100, 'met on the way in');
  assert.equal(sweptTouch(path, { x: 150, y: 260 }, { x: 150, y: 260 }), -1);
});

test('offline: a CPU smash at full speed into a still racket is always returned', () => {
  for (const y of [260, 300, 340]) {
    const game = createGame({ withCpu: true });
    game.restart(0, 1);
    game.setEffects(false);
    for (let i = 0; i < 5; i++) game.simulate(step);
    game.moveRacket('left', { x: 200, y, time: 0 });
    game.testShot({ x: 330, y, vx: -2400, vy: 0 });
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) {
      game.simulate(step);
      hit = game.view().flash > 0.2;
    }
    assert.ok(hit, `blocked at y=${y}`);
  }
});
