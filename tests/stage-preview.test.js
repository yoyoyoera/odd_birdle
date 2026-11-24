import test from 'node:test';
import assert from 'node:assert/strict';
import { center, createGame, createTwinShuttleGame, floor, rightLine, step, twinShuttleContact, width } from '../game.js';
import { stages } from '../stages.js';

const rules = id => stages.find(stage => stage.id === id).rules;

test('Bomb Rally scores an immediate landing explosion and replaces the bomb next point', t => {
  let roll = 0;
  t.mock.method(Math, 'random', () => roll);
  const game = createGame({ withCpu: true, rules: rules(7) });
  game.restart();
  assert.equal(game.view().bomb.secondsLeft, 3);
  for (let i = 0; i < 240 && game.view().phase === 'live'; i++) game.simulate(step);
  const exploded = game.view();
  assert.equal(exploded.eventText, 'BOOM!');
  assert.deepEqual(exploded.score, { left: 0, right: 1 });
  assert.ok(exploded.bombBurst.x < center);
  assert.equal(exploded.shuttle, undefined);
  roll = 0.99;
  for (let i = 0; i < 120 && game.view().phase === 'between'; i++) game.simulate(step);
  assert.equal(game.view().bomb.secondsLeft, 7);
  assert.equal(game.view().bombBurst, undefined);
});

test('the bomb fuse starts after the countdown and awards the other side if it expires in the air', t => {
  t.mock.method(Math, 'random', () => 0.9);
  const game = createGame({ withCpu: true, externallyDrivenCpu: true, rules: rules(7) });
  game.restart(3);
  assert.equal(game.view().bomb, undefined);
  for (let i = 0; i < 360; i++) game.simulate(step);
  assert.equal(game.view().bomb.secondsLeft, 7);
  assert.equal(game.view().bomb.remaining, 1);
  const { shuttle } = game.rally();
  Object.assign(shuttle, { x: center + 75, y: 200, gravity: 0, vy: 0 });
  for (let i = 0; i < 120; i++) game.simulate(step);
  assert.equal(game.view().bomb.secondsLeft, 6);
  assert.ok(Math.abs(game.view().bomb.remaining - 6 / 7) < 1e-9);
  assert.ok(game.view().shuttle.angle > 0);
  for (let i = 120; i < 839; i++) game.simulate(step);
  assert.equal(game.view().bomb.secondsLeft, 1);
  assert.deepEqual(game.view().score, { left: 0, right: 0 });
  game.simulate(step);
  assert.deepEqual(game.view().score, { left: 1, right: 0 });
  assert.deepEqual(game.view().bombBurst, { x: center + 75, y: 200, age: 0 });
});

for (const [label, end] of [
  ['landing outside the far line', { x: rightLine + 10, y: floor - 21, vx: 0, vy: 240 }],
  ['flying off the far edge', { x: width + 25, y: 200, vx: 240, vy: 0 }]
]) {
  test('Bomb Rally calls OUT when ' + label, () => {
    const game = createGame({ withCpu: true, externallyDrivenCpu: true, rules: rules(7) });
    game.restart();
    const { shuttle } = game.rally();
    game.moveRacket('left', { x: shuttle.x, y: shuttle.y + 60, time: 0 });
    game.moveRacket('left', { x: shuttle.x, y: shuttle.y + 5, time: 50 });
    assert.ok(game.view().flash > 0, 'the player hit the bomb');
    Object.assign(shuttle, end);
    game.simulate(step);
    const result = game.view();
    assert.equal(result.eventText, 'out');
    assert.deepEqual(result.score, { left: 0, right: 1 }, 'the hitter loses the point');
    assert.equal(result.bombBurst, undefined);
    assert.equal(result.bomb.lit, false);
    assert.ok(result.shuttle);
  });
}

for (const [roll, event, expectedScore] of [
  [0.03, 'SPLIT · REPLAY', { left: 0, right: 0 }],
  [0.4, 'BOTH LOST', { left: 0, right: 1 }]
]) {
  test('Twin Shuttles waits for both decisions: ' + event, t => {
    t.mock.method(Math, 'random', () => roll);
    const game = createTwinShuttleGame();
    game.restart(0, 2, { ...rules(15), cpuLevel: 2 });
    game.moveRacket('left', { x: 20, y: 10, time: 0 });
    const opening = game.view().shuttles;
    assert.equal(opening.length, 2);
    assert.ok(opening[0].x < center && opening[1].x > center);
    assert.ok(opening.every(shuttle => shuttle.color === undefined), 'both use the default shuttle color');
    assert.deepEqual(game.view().shuttleWins, { left: 0, right: 0 });
    let stepsSinceFirstCall = 0;
    for (let i = 0; i < 360 && game.view().shuttles.length === 2; i++) game.simulate(step);
    assert.equal(game.view().shuttles.length, 1, 'the unresolved shuttle keeps moving');
    assert.equal(game.view().shuttles[0].flight % 2, 1, 'the first child has finished');
    assert.deepEqual(game.view().shuttleWins, { left: 0, right: 1 });
    assert.deepEqual(game.view().score, { left: 0, right: 0 });
    assert.equal(game.view().firstCallVisible, true);
    assert.equal(game.view().shuttleCalls[0].reason, 'missed serve');
    assert.equal(game.view().settledShuttle, undefined);
    game.moveRacket('left', { x: 40, y: 30, time: 100 });
    assert.equal(game.view().left.x, 40, 'the visible racket follows the remaining shuttle input');
    assert.equal(game.view().left.y, 30);
    game.moveRacket('left', undefined);
    assert.equal(game.view().left, undefined, 'leaving the court does not bring back the finished racket');
    for (; stepsSinceFirstCall < 600 && game.view().phase === 'live'; stepsSinceFirstCall++) game.simulate(step);
    assert.equal(game.view().eventText, event);
    assert.deepEqual(game.view().score, expectedScore);
    assert.equal(game.view().shuttleWins.left + game.view().shuttleWins.right, 2);
    const settled = game.view().settledShuttle;
    assert.ok(settled, 'the last shuttle stays where it was called dead');
    assert.equal(game.view().shuttleCalls.length, 2);
    while (stepsSinceFirstCall < 299) {
      game.simulate(step);
      stepsSinceFirstCall++;
      assert.equal(game.view().firstCallVisible, true);
      assert.deepEqual(game.view().settledShuttle, settled);
    }
    game.simulate(step);
    assert.equal(game.view().firstCallVisible, false, 'the first call expires at 2.5 seconds');
    for (let i = 0; i < 132 && game.view().phase === 'between'; i++) game.simulate(step);
    assert.equal(game.view().shuttles.length, 2, 'both sides get a fresh drop');
    assert.deepEqual(game.view().shuttleWins, { left: 0, right: 0 });
    assert.equal(game.view().settledShuttle, undefined);
  });
}

test('the player can hit the remaining shuttle after the CPU wins the first one', t => {
  t.mock.method(Math, 'random', () => 0.4);
  const game = createTwinShuttleGame();
  game.restart(0, 4, rules(15));
  let incoming;
  for (let i = 0; i < 360; i++) {
    const view = game.view();
    if (view.shuttleWins.right === 1 && view.shuttle?.x < center - 35 && view.shuttle.y > 160) {
      incoming = view.shuttle;
      break;
    }
    game.simulate(step);
  }
  assert.ok(incoming, 'the second shuttle reaches the player');
  game.moveRacket('left', { x: incoming.x, y: incoming.y + 65, time: 1000 });
  game.moveRacket('left', { x: incoming.x, y: incoming.y + 5, time: 1020 });
  assert.ok(game.view().shuttle.flight > incoming.flight, 'the swing returned the shuttle');
  assert.deepEqual(game.view().shuttleWins, { left: 0, right: 1 });
});

test('swept twin shuttle contact catches fast crossing but leaves a near miss alone', () => {
  const first = { x: 80, y: 0, vx: 1000, vy: 0, size: 21 };
  const second = { x: 0, y: 0, vx: -1000, vy: 0, size: 21 };
  const start = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
  const hit = twinShuttleContact(first, second, ...start);
  assert.ok(hit.first.vx < 0 && hit.second.vx > 0, 'the shuttles bounce back before passing each other');
  assert.ok(hit.second.x - hit.first.x >= 42, 'their circles separate');
  assert.equal(twinShuttleContact(first, { ...second, y: 43 }, start[0], { ...start[1], y: 43 }), undefined);
});

test('two live shuttles ricochet off each other without deciding either one', t => {
  t.mock.method(Math, 'random', () => 0.4);
  const game = createTwinShuttleGame();
  game.restart(0, 4, rules(15));
  for (let i = 0; i < 16; i++) game.simulate(step);
  const { x, y } = game.view().shuttles[0];
  game.moveRacket('left', { x: x - 40, y: y + 22, time: 0 });
  game.moveRacket('left', { x, y, time: 70 });
  for (let i = 0; i < 100 && !game.view().shuttleClash; i++) game.simulate(step);

  const collision = game.view();
  assert.ok(collision.shuttleClash);
  assert.equal(collision.shuttles.length, 2);
  assert.deepEqual(collision.shuttleWins, { left: 0, right: 0 });
  game.simulate(step);
  assert.ok(game.view().shuttles[0].x < collision.shuttles[0].x);
  assert.ok(game.view().shuttles[1].x > collision.shuttles[1].x);
  assert.equal(game.view().shuttleClash.age, step, 'separating shuttles do not collide again');
});

test('a fourth consecutive hit loses only that shuttle in Twin Shuttles', t => {
  t.mock.method(Math, 'random', () => 0.4);
  const game = createTwinShuttleGame();
  game.restart(0, 4, rules(15), { touchLimit: 3 });
  for (let hit = 1; hit <= 4; hit++) {
    const shuttle = game.view().shuttles.find(bird => bird.flight % 2 === 0);
    assert.ok(shuttle && shuttle.x < center);
    game.moveRacket('left', undefined);
    game.moveRacket('left', { x: shuttle.x, y: shuttle.y, time: hit * 200 });
    if (hit < 4) assert.equal(game.view().shuttles[0].flight, shuttle.flight + 2);
    for (let i = 0; i < 18; i++) game.simulate(step);
  }
  const result = game.view();
  assert.equal(result.phase, 'live');
  assert.deepEqual(result.shuttleCalls, [{ index: 0, winner: 'right', reason: 'touch limit' }]);
  assert.equal(result.shuttles.length, 1);
  assert.deepEqual(result.score, { left: 0, right: 0 });
});

for (const stage of [undefined, 7]) {
  test(`fourth hit faults in ${stage ? 'Bomb Rally' : 'an ordinary CPU match'}`, t => {
    t.mock.method(Math, 'random', () => 0.4);
    const game = createGame({ withCpu: true, externallyDrivenCpu: true });
    game.setEffects(false);
    game.restart(0, 4, stage ? rules(stage) : null, { touchLimit: 3 });
    for (let hit = 1; hit <= 4; hit++) {
      const shuttle = game.rally().shuttle;
      const priorFlight = game.view().shuttle.flight;
      game.moveRacket('left', undefined);
      game.moveRacket('left', { x: shuttle.x, y: shuttle.y, time: hit * 200 });
      if (hit < 4) assert.equal(game.view().shuttle.flight, priorFlight + 1);
      for (let i = 0; i < 18; i++) game.simulate(step);
    }
    assert.equal(game.view().eventText, 'THAT’S FOUR!');
    assert.deepEqual(game.view().score, { left: 0, right: 1 });
    assert.equal(game.view().bombBurst, undefined);
    assert.ok(game.view().shuttle);
  });
}
