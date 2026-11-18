import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../game.js';

// A scripted player lobs every shuttle across; we count the points the CPU throws away (net, own court, out).
function cpuFaults(t, effect, seconds = 300, level = 4) {
  let seed = 777;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  t.mock.method(Math, 'random', rand);
  const game = createGame({ withCpu: true, quickEvents: true });
  game.setOnlyEffect(effect);
  game.restart(0, level);
  let last = { left: 0, right: 0 };
  const faults = { count: 0, points: 0 };
  for (let i = 0; i < seconds / step; i++) {
    const frame = game.contactFrame();
    if (frame?.canHit && frame.x < 450 && frame.y > 200 && frame.y < 420) {
      const dx = 24 + rand() * 12, dy = 45 + rand() * 20, ms = 80 + rand() * 15;
      game.moveRacket('left', null);
      game.moveRacket('left', { x: frame.x - dx, y: frame.y + dy, time: 0 }, frame);
      game.moveRacket('left', { x: frame.x, y: frame.y, time: ms }, { ...frame, time: 0, age: 0 });
      game.moveRacket('left', null);
    }
    game.simulate(step);
    const view = game.view();
    if (view.score.left !== last.left || view.score.right !== last.right) {
      faults.points++;
      if (view.score.left > last.left && ['own court', 'Net', 'out', 'Landed'].includes(view.message)) faults.count++;
      last = { ...view.score };
    }
    if (view.phase === 'finished') { game.restart(0, level); last = { left: 0, right: 0 }; }
  }
  return faults;
}

test('the CPU sees where a shuttle pushed by GUST or BALLOON is really going', t => {
  // Before it flew the shuttle forward with the push of the effect, the CPU threw away about half of its points here.
  const wind = cpuFaults(t, 'wind');
  assert.ok(wind.count <= 2, `GUST: the CPU lost ${wind.count} of ${wind.points} points by itself`);
  const balloon = cpuFaults(t, 'balloon');
  assert.ok(balloon.count <= 1, `BALLOON: the CPU lost ${balloon.count} of ${balloon.points} points by itself`);
});

test('the CPU plays round the BUMPER post and can play a shuttle that bounced back to it', t => {
  const bumper = cpuFaults(t, 'bumper');
  assert.ok(bumper.count <= 3, `BUMPER: the CPU lost ${bumper.count} of ${bumper.points} points by itself`);
});
