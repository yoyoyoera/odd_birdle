import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateStage } from '../tools/stage-difficulty.mjs';
import { stages } from '../stages.js';

const stageOne = stages[0];
const cpuPoints = (rules, seeds) => seeds.reduce((total, seed) => {
  const match = simulateStage({ ...stageOne, rules }, { seed, maxSeconds: 200 });
  return total + match.score.right;
}, 0);

test('a stage can make its CPU clumsier than its level: it scores less against the same player', () => {
  const seeds = Array.from({ length: 12 }, (_, index) => 777 + index * 31);
  const asLevel = cpuPoints({ ...stageOne.rules, cpuEase: 0 }, seeds);
  const eased = cpuPoints({ ...stageOne.rules, cpuEase: 1 }, seeds);
  assert.ok(eased < asLevel, `eased ${eased} should be below as-level ${asLevel}`);
});

test('the first stages use the eased CPU, later levels do not', () => {
  assert.ok(stages[0].rules.cpuEase > 0 && stages[1].rules.cpuEase > 0);
  assert.ok(stages.slice(2).every(stage => !stage.rules.cpuEase));
});
