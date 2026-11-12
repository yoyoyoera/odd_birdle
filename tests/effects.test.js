import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, forceAt, projectStrike, step } from '../game.js';

// Math.random is pinned so serves are repeatable; `roll.value` picks shapes and gust directions.
function pinned(t, value = 0.5) {
  const roll = { value };
  t.mock.method(Math, 'random', () => roll.value);
  return roll;
}

const run = (game, seconds) => { for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step); };

function serve(t, { shapeRoll = 0.5, cpu = false } = {}) {
  const roll = pinned(t, shapeRoll);
  const game = createGame({ withCpu: cpu });
  game.restart(0);
  return { game, roll };
}

test('forceAt ramps in and out, and is gone after the effect', () => {
  const wind = { type: 'wind', x: 560, y: 0, duration: 1.5, elapsed: 0 };
  assert.equal(forceAt(wind, 0).x, 0);
  assert.ok(forceAt(wind, 0.1).x > 0 && forceAt(wind, 0.1).x < 560);
  assert.equal(forceAt(wind, 0.7).x, 560);
  assert.ok(forceAt(wind, 1.4).x < 560);
  assert.equal(forceAt(wind, 1.5).x, 0);
  const balloon = { type: 'balloon', duration: 2.5, elapsed: 0 };
  assert.equal(forceAt(balloon, 1).gravity, 0.28);
  assert.equal(forceAt(balloon, 3).gravity, 1);
});

test('GUST keeps pushing, and draggier shapes are pushed further', t => {
  const push = shapeRoll => {
    const { game, roll } = serve(t, { shapeRoll });
    roll.value = 0.3;
    assert.ok(game.triggerEffect('wind'));
    assert.match(game.view().eventText, /^GUST →$/);
    const xs = [];
    for (let i = 0; i < 4; i++) { run(game, 0.3); xs.push(game.view().shuttle.x); }
    return { shape: game.view().shuttle.shape, travelled: xs.at(-1) - 245, xs };
  };
  const circle = push(0.1);
  const plank = push(0.35);
  assert.notEqual(circle.shape, plank.shape);
  assert.ok(circle.travelled > 60, `circle moved ${circle.travelled}`);
  assert.ok(plank.travelled > circle.travelled + 20, `plank ${plank.travelled} vs circle ${circle.travelled}`);
  // Steady pushing, not a one-off shove: it keeps gaining ground through most of the gust.
  assert.ok(plank.xs[2] - plank.xs[1] > 20);
});

test('GUST can blow up and down, and the label says which way', t => {
  const heightAfter = word => {
    const { game, roll } = serve(t, { shapeRoll: 0.35 });
    roll.value = word === 'none' ? 0 : { '←': 0.1, '→': 0.3, '↑': 0.6, '↓': 0.9 }[word];
    if (word !== 'none') {
      game.triggerEffect('wind');
      assert.equal(game.view().eventText, `GUST ${word}`);
    }
    run(game, 0.6);
    return game.view().shuttle.y;
  };
  const calm = heightAfter('none');
  assert.ok(heightAfter('↑') < calm - 40, 'an updraft holds it up');
  assert.ok(heightAfter('↓') > calm + 20, 'a downdraft drops it faster');
});

test('BALLOON lasts 2.5 to 3 seconds and floats the bigger shuttle', t => {
  for (const [roll, low, high] of [[0, 2.5, 2.51], [0.999, 2.99, 3]]) {
    const { game, roll: control } = serve(t);
    control.value = roll;
    game.triggerEffect('balloon');
    const length = game.view().force.duration;
    assert.ok(length >= low && length <= high, `lasts ${length}`);
  }
  const { game } = serve(t);
  const { game: calm } = serve(t);
  const before = game.view().shuttle.size;
  game.triggerEffect('balloon');
  run(game, 0.6);
  run(calm, 0.6);
  assert.equal(game.view().shuttle.size, before * 2);
  assert.ok(game.view().shuttle.y < calm.view().shuttle.y - 60, 'floats instead of dropping');
});

test('FREEZE lasts 1.5 seconds, holds only the shuttle, then it flies on as before', t => {
  const { game } = serve(t);
  run(game, 0.2);
  const pace = game.view().shuttle;
  assert.ok(game.triggerEffect('freeze'));
  assert.equal(game.view().frozen, true);
  run(game, 1.4);
  assert.equal(game.view().frozen, true);
  assert.deepEqual([game.view().shuttle.x, game.view().shuttle.y], [pace.x, pace.y]);
  run(game, 0.2);
  assert.equal(game.view().frozen, false);
  run(game, 0.1);
  assert.ok(game.view().shuttle.y > pace.y, 'falls again once thawed');
});

test('while the shuttle is frozen the CPU walks over but cannot hit it, then waits a beat', t => {
  const { game } = serve(t, { cpu: true });
  // Let the left side miss: the CPU wins the point and serves from its own side.
  let guard = 0;
  while (!(game.view().phase === 'live' && game.view().shuttle?.x > 450) && guard++ < 4000) run(game, 0.05);
  assert.ok(game.view().shuttle.x > 450, 'serve is on the CPU side');
  const start = game.view().right.y;
  assert.ok(game.triggerEffect('freeze'));
  const frozenAt = { ...game.view().shuttle };
  run(game, 1.2);
  assert.deepEqual([game.view().shuttle.x, game.view().shuttle.y], [frozenAt.x, frozenAt.y]);
  assert.equal(game.view().flash, 0, 'no hit while frozen');
  assert.ok(Math.abs(game.view().right.y - start) > 30, 'the CPU moved towards the shuttle');
});

test('effects start only in a live rally, one at a time', t => {
  const { game } = serve(t);
  assert.equal(game.triggerEffect('nothing'), false);
  assert.ok(game.triggerEffect('wind'));
  assert.equal(game.triggerEffect('freeze'), false);
  const lobby = createGame();
  assert.equal(lobby.triggerEffect('wind'), false);
});

test('a hit during GUST or BALLOON is replayed by clients exactly as the server flies it', t => {
  for (const [effect, roll] of [['wind', 0.3], ['wind', 0.6], ['balloon', 0.5]]) {
    const { game, roll: control } = serve(t);
    control.value = roll;
    game.triggerEffect(effect);
    run(game, 0.3);
    // Rooms add the contact time (and age) when they replay a client's swing.
    const frame = { ...game.contactFrame(), time: 100, age: 0 };
    game.moveRacket('left', { x: frame.x - 35, y: frame.y, time: 0 }, frame);
    game.moveRacket('left', { x: frame.x, y: frame.y, time: 25 }, frame);
    const { strike } = game.view();
    assert.ok(strike, 'the hit produced a strike');
    assert.equal(strike.force?.type, effect);
    game.moveRacket('left', null);
    for (const ticks of [20, 60, 120]) {
      run(game, ticks * step - (game.__ran ?? 0));
      game.__ran = ticks * step;
      const live = game.view().shuttle;
      const replay = projectStrike(strike.pose, strike.motion, ticks * step, strike.force);
      assert.ok(Math.hypot(live.x - replay.x, live.y - replay.y) < 1.5,
        `${effect} after ${ticks} ticks: ${live.x.toFixed(1)},${live.y.toFixed(1)} vs ${replay.x.toFixed(1)},${replay.y.toFixed(1)}`);
    }
  }
});

test('HIGH NET and LOW NET use the size picked for them', t => {
  const netAfter = (id, scale) => {
    const { game } = serve(t, { shapeRoll: 0.05 });
    if (scale) game.setNetScale(id, scale);
    assert.ok(game.triggerEffect(id));
    run(game, 0.8);
    return game.view().netTop;
  };
  // Net base is 106 tall here (342 to the floor at 448).
  // The defaults: a net twice as tall, and a net sunk to 30%.
  assert.equal(Math.round(netAfter('highNet')), 448 - Math.round(106 * 2));
  assert.equal(Math.round(netAfter('lowNet')), 448 - Math.round(106 * 0.3));
  assert.equal(Math.round(netAfter('highNet', 2.2)), 448 - Math.round(106 * 2.2));
  assert.equal(Math.round(netAfter('lowNet', 0.5)), 448 - Math.round(106 * 0.5));
  // Nonsense sizes are ignored.
  assert.equal(Math.round(netAfter('highNet', -3)), 448 - Math.round(106 * 2));
});
