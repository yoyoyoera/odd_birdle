import test from 'node:test';
import assert from 'node:assert/strict';
import { bigRacketScale, createGame, racketRadius, step } from '../game.js';

// A shuttle flying flat at y = 300 passes a still racket held `gap` units below its path.
function passes(gap, big, withCpu = true) {
  const game = createGame({ withCpu });
  // The smallest round-ish shuttle, so the reach is the racket's.
  game.setShuttle({ shape: 0, size: 0 });
  game.restart(0, 1);
  if (withCpu) game.setEffects(false);
  for (let i = 0; i < 5; i++) game.simulate(step);
  game.moveRacket('left', { x: 200, y: 300 + gap, time: 0, ...(big ? { big: true } : {}) });
  if (!withCpu) return game.view().left;
  game.testShot({ x: 330, y: 300, vx: -900, vy: 0 });
  for (let i = 0; i < 40; i++) {
    game.simulate(step);
    if (game.view().flash > 0.2) return true;
  }
  return false;
}

test('a big touch racket in a CPU match hits as big as it is drawn, and a normal one does not reach as far', () => {
  // Between the normal reach and the big reach (racket radius 22, big 30.8, plus the shuttle's own size).
  const gap = 46;
  assert.equal(passes(gap, false), false, 'the usual racket misses');
  assert.equal(passes(gap, true), true, 'the big one hits');
  assert.equal(Math.round(racketRadius * bigRacketScale), 31);
});

test('the big racket shows its size in the view, and online games ignore it', () => {
  const game = createGame({ withCpu: true });
  game.restart(0, 1);
  for (let i = 0; i < 5; i++) game.simulate(step);
  game.moveRacket('left', { x: 200, y: 300, time: 0, big: true });
  assert.ok(game.view().left.r > racketRadius);
  const online = passes(0, true, false);
  assert.equal(online.r, undefined, 'the server keeps every racket the usual size');
});
