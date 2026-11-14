import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrowd } from '../crowd.js';
import { cheerAmount } from '../stands.js';

const live = { phase: 'live', effect: undefined };
const hit = { type: 'hit', side: 'left' };

test('a long rally murmurs, gets the crowd up, and sitting down again when the point ends', () => {
  const crowd = createCrowd();
  let now = 0;
  const cues = [];
  let state;
  for (let i = 0; i < 16; i++) {
    now += 16;
    state = crowd.update(live, [hit], now);
    cues.push(...state.cues);
  }
  assert.deepEqual(cues, ['murmur', 'murmur'], 'at the 8th and the 15th hit');
  for (let i = 0; i < 90; i++) state = crowd.update(live, [], now += 16);
  assert.ok(state.mood.standing > 0.8, 'standing');
  state = crowd.update({ phase: 'between' }, [{ type: 'score', side: 'left' }], now += 16);
  assert.deepEqual(state.cues, ['applause']);
  for (let i = 0; i < 120; i++) state = crowd.update({ phase: 'between' }, [], now += 16);
  assert.ok(state.mood.standing < 0.1, 'sat down');
});

test('a point cheers the scorer side, and groans when the local player lost it', () => {
  const crowd = createCrowd();
  const lost = crowd.update(live, [{ type: 'score', side: 'right' }], 100, 'left');
  assert.deepEqual(lost.cues, ['applause', 'groan']);
  assert.deepEqual(lost.cheer, { side: 'right', since: 100 });
  const won = createCrowd().update(live, [{ type: 'score', side: 'left' }], 100, 'left');
  assert.deepEqual(won.cues, ['applause']);
});

test('the winner side keeps cheering when the match ends, and the big applause plays once', () => {
  const crowd = createCrowd();
  const end = crowd.update({ phase: 'finished', winner: 'right' }, [{ type: 'score', side: 'right' }], 100, 'right');
  assert.deepEqual(end.cues, ['applauseBig']);
  assert.equal(end.cheer.finale, true);
  assert.equal(crowd.update({ phase: 'finished', winner: 'right' }, [], 200, 'right').cheer.finale, true);
  assert.equal(crowd.update({ phase: 'live' }, [], 300, 'right').cheer, undefined, 'a new match starts calm');
});

test('effects change the mood: FREEZE stops the crowd clock, surprising ones startle, GUST leans them', () => {
  const crowd = createCrowd();
  let state = crowd.update(live, [], 0);
  state = crowd.update(live, [], 100);
  const before = state.mood.clock;
  assert.ok(before > 0);
  state = crowd.update({ ...live, effect: 'freeze' }, [], 200);
  const frozen = crowd.update({ ...live, effect: 'freeze' }, [], 300).mood.clock;
  assert.equal(frozen, state.mood.clock, 'the clock stands still');
  state = crowd.update({ ...live, effect: 'highNet' }, [], 400);
  assert.ok(state.mood.surprise > 0.9 && state.mood.effect === 'highNet');
  state = crowd.update({ ...live, effect: 'wind', force: { type: 'wind', x: -300, y: 0 } }, [], 500);
  assert.equal(state.mood.wind, -1);
  assert.equal(crowd.update({ ...live, effect: 'wind', force: { type: 'wind', x: -300, y: 0 } }, [], 5000).mood.surprise, 0);
});

test('the losing side sinks and recovers more slowly than the winner side cheers', () => {
  const droop = { rise: 0.4, hold: 1.1, fall: 0.8 };
  const values = [0.1, 0.3, 0.6, 1.2, 2.0, 2.4, 3].map(t => cheerAmount(t, false, droop));
  assert.ok(values[0] > 0 && values[0] < 1 && values[3] === 1 && values[6] === 0);
  assert.equal(cheerAmount(9, true, droop), 1, 'stays at the finale');
});
