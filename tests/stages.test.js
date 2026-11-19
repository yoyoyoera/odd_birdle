import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, visibleStages, validClears, bonusUnlocked } from '../stages.js';
import { createStageProgress } from '../stage-progress.js';
import { shapeCount, randomEffectIds } from '../game.js';

const storageWith = entries => {
  const values = new Map(Object.entries(entries));
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), values };
};
const response = body => ({ ok: true, json: async () => body });

test('all20stages are available; bonus21 requires every normal stage', () => {
  assert.deepEqual(visibleStages([]).map(stage => stage.id), Array.from({ length: 20 }, (_, n) => n + 1));
  assert.equal(bonusUnlocked([20]), false);
  assert.equal(visibleStages(Array.from({ length: 19 }, (_, n) => n + 2)).length, 20);
  assert.equal(visibleStages(Array.from({ length: 20 }, (_, n) => n + 1)).length, 21);
  assert.deepEqual(validClears([3, 3, '1', 0, 22, 1, null]), [1, 3]);
});

test('stage variants preserve prescribed handicaps and doubles and their singles fallbacks', () => {
  const stage = id => stages.find(entry => entry.id === id);
  assert.deepEqual(stage(12).rules.startScore, { left: 0, right: 4 });
  assert.equal(stage(12).rules.points, 5);
  assert.equal(stage(4).rules.permanent, 'balloon');
  assert.equal(stage(4).rules.points, 3);
  assert.equal(stage(5).rules.permanent, 'wind');
  assert.equal(stage(14).rules.permanent, 'bumper');
  assert.equal(stage(19).rules.noCountdown, true);
  assert.equal(stage(9).rules.shuttleShape, shapeCount - 1);
  assert.equal(stage(7).rules.shuttleSize, 0);
  assert.equal(stage(15).rules.netSway, true);
  assert.equal(stage(11).rules.cpuSpike, 1);
  assert.equal(stage(17).rules.shrink, 0.92);
  assert.equal(stage(17).rules.shuttleSize, 2);
  assert.equal(stage(17).rules.shrinkTo, 5.5);
  assert.ok(stage(11).rules.cpuLift > 0.5);
  assert.equal(stage(20).rules.permanent, 'bumper');
  assert.equal(stage(20).rules.effectRate, 1.5);
  for (const id of [8, 13, 18, 21]) {
    assert.equal(stage(id).mode, 'doubles');
    assert.deepEqual(stage(id).rules.doubles, stage(id).doubles);
    assert.equal(stage(id).fallbackRules.doubles, undefined);
    assert.equal(stage(id).fallbackRules.points, stage(id).rules.points);
  }
  for (const challenge of stages) {
    assert.ok(challenge.rules.points >= 1 && challenge.rules.cpuLevel >= 1 && challenge.rules.cpuLevel <= 5);
    if (Array.isArray(challenge.rules.effects)) for (const effect of challenge.rules.effects) assert.ok(randomEffectIds.includes(effect));
  }
});

test('server progress merges only the signed in account backup and restores in order', async () => {
  const store = storageWith({ 'oddbirdle-stages:t2_alice': JSON.stringify({ cleared: [2,1], pending: [2,1] }), 'oddbirdle-stages:guest': '[20]' });
  const posts = [];
  let server = [3];
  const progress = createStageProgress({ storage: store, identity: Promise.resolve('t2_alice'), request: async (_url, options) => {
    if (options.method === 'POST') {
      const { stage } = JSON.parse(options.body); posts.push(stage); server.push(stage);
    }
    return response({ cleared: server, userId: 't2_alice' });
  } });
  await progress.ready;
  assert.deepEqual(progress.cleared, [1, 2, 3]);
  assert.deepEqual(posts, [1, 2]);
  await progress.record(4);
  assert.deepEqual(posts, [1, 2, 4]);
  assert.deepEqual(progress.cleared, [1, 2, 3, 4]);
  assert.equal(store.values.get('oddbirdle-stages:guest'), '[20]');
});

test('blocked storage and failed server still retain clears for the visit', async () => {
  const progress = createStageProgress({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, identity: Promise.resolve('t2_player'), request: async () => { throw new Error('offline'); } });
  await progress.ready;
  await progress.record(6);
  assert.deepEqual(progress.cleared, [6]);
});

test('bonus backup is restored only after all normal stages, without duplicate writes', async () => {
  const reversed = Array.from({ length: 21 }, (_, n) => 21 - n);
  const store = storageWith({ 'oddbirdle-stages:t2_player': JSON.stringify({ cleared: reversed, pending: reversed }) });
  const calls = [], server = [];
  const progress = createStageProgress({ storage: store, identity: Promise.resolve('t2_player'), request: async (_url, options) => {
    if (options.method === 'POST') {
      const { stage } = JSON.parse(options.body); calls.push(stage); server.push(stage);
      if (stage === 21) assert.equal(server.length, 21);
    }
    return response({ userId: 't2_player', cleared: [...server] });
  } });
  await progress.ready;
  assert.deepEqual(calls, Array.from({ length: 21 }, (_, n) => n + 1));
  await progress.record(21);
  assert.equal(calls.length, 21);
});


test('server deletion is authoritative over previously confirmed device clears', async () => {
  const store = storageWith({ 'oddbirdle-stages:t2_player': JSON.stringify({ cleared: [1, 20, 21], pending: [] }) });
  const calls = [];
  const progress = createStageProgress({ storage: store, identity: Promise.resolve('t2_player'), request: async (_url, options) => {
    calls.push(options.method ?? 'GET');
    return response({ userId: 't2_player', cleared: [] });
  } });
  await progress.ready;
  assert.deepEqual(progress.cleared, []);
  assert.deepEqual(calls, ['GET']);
});
