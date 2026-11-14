import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuSightError, createGame, step } from '../game.js';

const run = (game, seconds) => { for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step); };

function seeded(seed) {
  let value = seed;
  return () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function serve(t, { cpu = false, shape = 1 } = {}) {
  t.mock.method(Math, 'random', seeded(3));
  const game = createGame({ withCpu: cpu });
  game.setShuttle({ shape, size: 1 });
  game.restart(0, 3);
  return game;
}

test('while INVISIBLE the shuttle is hidden but its shadow follows it along the floor', t => {
  const game = serve(t);
  run(game, 0.2);
  assert.ok(game.view().shuttle, 'visible before');
  assert.ok(game.triggerEffect('invisible'));
  run(game, 0.05);
  const view = game.view();
  assert.equal(view.shuttle, undefined);
  assert.ok(view.shadow, 'the shadow takes over');
  // The shuttle keeps falling, and the shadow gets nearer the floor.
  const before = view.shadow.near;
  run(game, 0.3);
  assert.ok(game.view().shadow.near > before, 'lower is nearer the floor');
  assert.ok(game.view().shadow.near <= 1 && game.view().shadow.x > 0);
});

test('the shadow carries no height numbers beyond a 0-1 hint, and the shuttle is back with the effect over', t => {
  const game = serve(t);
  game.setEffectSeconds('invisible', 0.3);
  game.triggerEffect('invisible');
  run(game, 0.2);
  assert.deepEqual(Object.keys(game.view().shadow).sort(), ['near', 'x']);
  assert.equal(game.view().shuttle, undefined);
  run(game, 0.2);
  assert.ok(game.view().shuttle, 'visible again');
});

test('a hit shows the shuttle for a moment, then it is hidden again', t => {
  const game = serve(t);
  game.triggerEffect('invisible');
  run(game, 0.15);
  const frame = { ...game.contactFrame(), time: 100, age: 0 };
  game.moveRacket('left', { x: frame.x - 10, y: frame.y + 40, time: 0 }, frame);
  game.moveRacket('left', { x: frame.x, y: frame.y, time: 25 }, frame);
  game.moveRacket('left', null);
  assert.equal(game.view().message, 'Rally in progress', 'the swing hit it');
  assert.ok(game.view().shuttle, 'revealed by the hit');
  run(game, 0.06);
  assert.ok(game.view().shuttle, 'still shown a moment later');
  run(game, 0.2);
  assert.equal(game.view().shuttle, undefined, 'hidden again');
  assert.ok(game.view().shadow, 'the shadow remains');
});

test('the test panel can change how long INVISIBLE lasts, and nonsense restores the usual second', t => {
  const lasts = seconds => {
    const game = serve(t);
    game.setEffectSeconds('invisible', seconds);
    game.triggerEffect('invisible');
    let hidden = 0;
    for (let tick = 0; tick < 600; tick++) {
      game.simulate(step);
      if (!game.view().shuttle && game.view().phase === 'live') hidden += step; else break;
    }
    return hidden;
  };
  const near = (value, wanted) => Math.abs(value - wanted) < 0.03;
  assert.ok(near(lasts(0.3), 0.3), `0.3s lasted ${lasts(0.3)}`);
  assert.ok(near(lasts(0.6), 0.6), `0.6s lasted ${lasts(0.6)}`);
  assert.ok(near(lasts(NaN), 1), `the default lasted ${lasts(NaN)}`);
  assert.ok(near(lasts(-2), 1), 'a negative time is ignored');
});

test('the weaker the CPU, the worse its guess of the height', () => {
  assert.ok(cpuSightError(1) > cpuSightError(3) && cpuSightError(3) > cpuSightError(5));
  assert.ok(cpuSightError(5) >= 14, 'even the best CPU is not exact');
});

test('the CPU no longer knows an invisible shuttle perfectly: weaker CPUs return fewer', t => {
  // Feed lobs from the left, hide the shuttle right after, and count how often the CPU returns it.
  const returned = level => {
    t.mock.method(Math, 'random', seeded(100 + level));
    let wins = 0;
    let reached = 0;
    for (let trial = 0; trial < 150; trial++) {
      const game = createGame({ withCpu: true });
      game.setShuttle({ shape: 1, size: 1 });
      game.restart(0, level);
      while (game.view().phase === 'live' && game.view().shuttle.y < 200) run(game, step);
      const bird = game.view().shuttle;
      const dirX = 0.2 + Math.random() * 0.25;
      const dirY = Math.sqrt(1 - dirX * dirX);
      const reach = 22 + bird.size + 14;
      game.moveRacket('left', { x: bird.x - dirX * reach, y: bird.y + dirY * reach, time: 0 });
      game.moveRacket('left', { x: bird.x, y: bird.y, time: reach / 1.5 });
      game.moveRacket('left', null);
      if (game.view().message !== 'Rally in progress') continue;
      game.triggerEffect('invisible');
      const before = { ...game.view().score };
      for (let i = 0; i < 1200 && game.view().phase === 'live'; i++) run(game, 0.01);
      const after = game.view().score;
      const reason = game.view().message;
      if (after.right > before.right && reason === 'Landed') { wins++; reached++; }
      else if (after.left > before.left && ['Landed', 'Net', 'out'].includes(reason)) reached++;
    }
    t.mock.restoreAll();
    return { rate: wins / Math.max(1, reached), reached };
  };
  const strong = returned(5);
  const weak = returned(1);
  assert.ok(strong.reached > 30 && weak.reached > 30, `enough lobs reached the CPU (${strong.reached}, ${weak.reached})`);
  assert.ok(strong.rate >= weak.rate, `Lv5 ${strong.rate.toFixed(2)} should not be worse than Lv1 ${weak.rate.toFixed(2)}`);
});
