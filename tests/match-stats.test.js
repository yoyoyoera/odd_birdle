import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchStats } from '../match-stats.js';

const live = (score, extra = {}) => ({ phase: 'live', score, ...extra });

test('counts the longest rally, each effect once, and a comeback', () => {
  const stats = createMatchStats();
  for (let flight = 1; flight <= 4; flight++) stats.update(live({ left: 0, right: 0 }, { strike: { flight } }));
  stats.update(live({ left: 0, right: 1 }, { effect: 'shock' }));
  stats.update(live({ left: 0, right: 1 }, { effect: 'shock' }));
  stats.update(live({ left: 0, right: 2 }, { effect: undefined }));
  stats.update(live({ left: 0, right: 2 }, { effect: 'wind' }));
  for (let flight = 10; flight <= 11; flight++) stats.update(live({ left: 0, right: 2 }, { strike: { flight } }));
  stats.update(live({ left: 3, right: 2 }, { effect: 'shock' }));
  const done = { phase: 'finished', score: { left: 3, right: 2 }, winner: 'left', cpuLevel: 3 };
  stats.update(done);
  const summary = stats.summary(done);
  assert.equal(summary.rally, 4);
  assert.deepEqual(summary.effects, [['SHOCK', 2], ['GUST', 1]]);
  assert.equal(summary.effectKinds, 2);
  assert.equal(summary.comeback, true);
  assert.equal(summary.won, true);
  assert.equal(summary.mine, 3);
});

test('a loss is not a comeback and reset starts clean', () => {
  const stats = createMatchStats();
  stats.update(live({ left: 0, right: 3 }, { effect: 'decoy' }));
  const done = { phase: 'finished', score: { left: 1, right: 3 }, winner: 'right', cpuLevel: 2 };
  assert.equal(stats.summary(done).comeback, false);
  stats.reset();
  assert.deepEqual(stats.summary(done).effects, []);
});
