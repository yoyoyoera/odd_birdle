import test from 'node:test';
import assert from 'node:assert/strict';
import { center, createGame, invasionReturnSeconds, racketRadius, step } from '../game.js';

const run = (game, seconds) => { for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step); };

// Keeps a rally going (a high lob nobody has to answer) so the effect is not cut short by a point.
const lob = game => game.testShot({ x: 250, y: 90, vx: 0, vy: -800, hitter: 'left', keep: true });
function rally(game, seconds) {
  for (let i = 0; i < Math.round(seconds / step) && game.view().phase === 'live'; i++) {
    game.simulate(step);
    const shuttle = game.view().shuttle;
    if (shuttle && shuttle.y > 330) lob(game);
  }
}

// A CPU match in a live rally with nothing else going on, and INVASION just started.
function invasion({ level = 3 } = {}) {
  const game = createGame({ withCpu: true });
  game.restart(0, level);
  game.setEffects(false);
  run(game, 0.05);
  lob(game);
  assert.ok(game.triggerEffect('invasion'));
  return game;
}

test('INVASION is for CPU matches, comes after a 3-2-1 when asked with a lead, and lasts 6 to 8 seconds', () => {
  const online = createGame();
  online.restart(0);
  assert.equal(online.triggerEffect('invasion'), false, 'an online room refuses it');
  const game = createGame({ withCpu: true });
  game.restart(0, 3);
  game.setEffects(false);
  run(game, 0.05);
  lob(game);
  assert.ok(game.triggerEffect('invasion', true));
  assert.equal(game.view().armed, 'invasion');
  assert.equal(game.view().eventText, '3');
  assert.equal(game.view().effect, undefined, 'not yet');
  rally(game, 1.1);
  assert.equal(game.view().eventText, '2');
  rally(game, 1.1);
  assert.equal(game.view().eventText, '1');
  rally(game, 1.1);
  assert.equal(game.view().effect, 'invasion');
  assert.equal(game.view().eventText, 'INVASION');
  assert.equal(game.view().armed, undefined);
  // (0.3 s of it has already gone by here.)
  const total = game.view().invasion.remaining + 0.3;
  assert.ok(total >= 5.95 && total <= 8.05, `${total}`);
  assert.equal(game.triggerEffect('wind'), false, 'one effect at a time');
});

test('while it is on, either racket may go anywhere; before and after, each stays on its own half', () => {
  const game = createGame({ withCpu: true });
  game.restart(0, 3);
  game.setEffects(false);
  run(game, 0.05);
  lob(game);
  game.moveRacket('left', { x: 800, y: 300, time: 0 });
  assert.equal(game.view().left.x, center - racketRadius, 'not yet');
  game.triggerEffect('invasion');
  game.moveRacket('left', { x: 800, y: 300, time: 20 });
  assert.equal(game.view().left.x, 800);
  assert.equal(game.view().invasion.back, false);
  assert.equal(game.invasionExtra(), center);
  for (let i = 0; i < 12 * 120 && game.view().effect === 'invasion'; i++) {
    game.simulate(step);
    if (game.view().shuttle?.y > 330) lob(game);
  }
  assert.equal(game.view().effect, undefined, 'over');
  rally(game, 0.3);
  assert.ok(game.view().left.x <= center - racketRadius + 1e-6, `racket back home at ${game.view().left.x}`);
  assert.ok(game.view().right.x >= center + racketRadius - 1e-6);
  assert.equal(invasionReturnSeconds, 1);
});

test('"GET BACK!" shows in its last second and the way over the net narrows smoothly', () => {
  const game = invasion();
  const seen = [];
  const texts = new Set();
  for (let i = 0; i < 12 * 120 && game.view().effect === 'invasion'; i++) {
    game.simulate(step);
    if (game.view().shuttle?.y > 330) lob(game);
    const v = game.view();
    if (v.invasion) seen.push(v.invasion.extra);
    texts.add(v.eventText);
  }
  assert.ok(texts.has('GET BACK!'));
  assert.equal(Math.max(...seen), center);
  const tail = seen.slice(-110);
  for (let i = 1; i < tail.length; i++) assert.ok(tail[i] <= tail[i - 1] + 1e-9, 'never opens again');
  assert.ok(seen.at(-1) < 5, 'closed by the end');
});

test('a racket over the net hits a shuttle on the other side; without INVASION it cannot', () => {
  for (const open of [false, true]) {
    const game = createGame({ withCpu: true });
    game.restart(0, 3);
    game.setEffects(false);
    run(game, 0.05);
    game.testShot({ x: 600, y: 230, vx: 0, vy: 0, hitter: 'right' });
    if (open) game.triggerEffect('invasion');
    game.moveRacket('left', { x: 600, y: 330, time: 0 });
    game.moveRacket('left', { x: 600, y: 240, time: 16 });
    assert.equal(game.view().flash > 0.2, open, open ? 'the invader hit it' : 'out of reach on the other side');
  }
});

test('a point is still decided by which floor the shuttle comes down on', () => {
  const cases = [
    ['left', 100, 'right', 'the player hit it and it came down on the player side'],
    ['right', 100, 'right', 'the CPU hit it and it came down on the player side'],
    ['left', 820, 'left', 'the player hit it and it came down on the CPU side'],
    ['right', 820, 'left', 'the CPU hit it and it came down on its own side']
  ];
  for (const [hitter, x, winner, why] of cases) {
    const game = invasion();
    game.testShot({ x, y: 390, vx: 0, vy: 300, hitter, keep: true });
    run(game, 0.6);
    const { left, right } = game.view().score;
    assert.equal(left + right, 1, why);
    assert.equal(game.view().score[winner], 1, why);
  }
});

test('rackets are solid: the player slides round the CPU racket instead of through it', () => {
  const game = invasion();
  rally(game, 0.2);
  const cpu = game.view().right;
  game.moveRacket('left', { x: cpu.x - 120, y: cpu.y, time: 0 });
  for (const [dx, dy] of [[0, 0], [10, 5], [-6, 0]]) {
    game.moveRacket('left', { x: cpu.x + dx, y: cpu.y + dy, time: 40 });
    const mine = game.view().left;
    const apart = Math.hypot(mine.x - cpu.x, mine.y - cpu.y);
    assert.ok(apart >= racketRadius * 2 - 1e-6, `${apart} apart, not through each other`);
  }
});

test('a hard hit of one racket on the other is a clash: counted once, the CPU thrown off and stunned', () => {
  const game = invasion();
  rally(game, 0.2);
  const cpu = game.view().right;
  // The player swings in at the CPU's racket fast (about 1500 units a second).
  let time = 0;
  for (let k = 8; k >= 0; k--) {
    game.moveRacket('left', { x: cpu.x - 44 - k * 12, y: cpu.y, time });
    time += 8;
  }
  game.simulate(step);
  const v = game.view();
  assert.equal(v.clash?.count, 1);
  assert.ok(v.clash.power > 0.5);
  assert.ok(Math.hypot(v.clash.x - cpu.x, v.clash.y - cpu.y) < 60, 'at the meeting place');
  const before = game.view().right.x;
  run(game, 0.1);
  assert.ok(game.view().right.x > before + 5, 'thrown to the far side');
  // A touch after that, without speed, is not another clash.
  game.moveRacket('left', { x: game.view().right.x - 44, y: game.view().right.y, time: time + 2000 });
  run(game, 0.1);
  assert.equal(game.view().clash.count, 1);
});

test('the CPU goes over the net for a shuttle on the player side and hits it back down on that court', () => {
  const game = invasion({ level: 4 });
  game.testShot({ x: 250, y: 120, vx: 0, vy: -450, hitter: 'left', keep: true });
  let crossed = false;
  let hit = false;
  for (let i = 0; i < 4 * 120 && game.view().phase === 'live'; i++) {
    game.simulate(step);
    const v = game.view();
    if (v.right.x < center - 20) crossed = true;
    if (v.flash > 0.2) hit = true;
  }
  assert.ok(crossed, 'the CPU came over');
  assert.ok(hit, 'and hit it');
});

test('the CPU charges the player racket now and then (when its dice say so), and otherwise minds the shuttle', t => {
  const meet = roll => {
    t.mock.method(Math, 'random', () => roll);
    const game = invasion();
    game.moveRacket('left', { x: 250, y: 330, time: 0 });
    game.testShot({ x: 700, y: 120, vx: 0, vy: -300, hitter: 'right', keep: true });
    for (let i = 0; i < 3 * 120 && game.view().phase === 'live'; i++) {
      game.simulate(step);
      const { left, right } = game.view();
      if (Math.hypot(left.x - right.x, left.y - right.y) < 80) return true;
    }
    return false;
  };
  assert.equal(meet(0), true, 'it came for the racket');
  t.mock.restoreAll();
  assert.equal(meet(0.99), false, 'it stayed with the shuttle');
});
