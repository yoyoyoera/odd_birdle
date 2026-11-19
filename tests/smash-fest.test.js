import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../game.js';
import { makePlayer } from '../tools/stage-difficulty.mjs';

const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// Counts the CPU's downward hits (smashes) over a few seeded matches against the same scripted player.
function smashes(extra) {
  const rules = { cpuLevel: 4, points: 99, effects: 'none', ...extra };
  let count = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const original = Math.random;
    Math.random = seeded(seed * 77);
    try {
      const game = createGame({ withCpu: true, rules });
      game.restart(0, 4, rules);
      const play = makePlayer(seeded(seed * 991), rules);
      let last = -1, from;
      for (let tick = 0, time = 0; tick < 120 * 120; tick++, time += step) {
        play(game, time);
        game.simulate(step);
        const shuttle = game.view().shuttle;
        if (shuttle && shuttle.flight !== last) { last = shuttle.flight; from = shuttle.x > 460 ? shuttle.y : undefined; }
        else if (from !== undefined && shuttle) { if (shuttle.y - from > 0.5) count++; from = undefined; }
      }
    } finally { Math.random = original; }
  }
  return count;
}

test('Smash Fest: the CPU sets the shuttle up and waits under it, so it smashes far more than a plain Lv.4', () => {
  const plain = smashes({});
  const fest = smashes({ cpuSpike: 1, cpuLift: 1 });
  assert.ok(fest > plain * 2, `smash fest ${fest} against plain ${plain}`);
});
