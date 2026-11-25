import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrowd } from '../crowd.js';
import { touchLimitFault } from '../game.js';
import { cheerAmount } from '../stands.js';

const live = { phase: 'live', effect: undefined };
const hit = { type: 'hit', side: 'left' };

test('a long rally gets the crowd up, and sitting down again when the point ends, all without a sound', () => {
  const crowd = createCrowd();
  let now = 0;
  const cues = [];
  let state;
  for (let i = 0; i < 16; i++) {
    now += 16;
    state = crowd.update(live, [hit], now);
    cues.push(...state.cues);
  }
  for (let i = 0; i < 90; i++) state = crowd.update(live, [], now += 16);
  assert.ok(state.mood.standing > 0.8, 'standing');
  state = crowd.update({ phase: 'between' }, [{ type: 'score', side: 'left' }], now += 16);
  cues.push(...state.cues);
  assert.deepEqual(state.cheer, { side: 'left', since: now });
  for (let i = 0; i < 120; i++) state = crowd.update({ phase: 'between' }, [], now += 16);
  assert.ok(state.mood.standing < 0.1, 'sat down');
  assert.deepEqual(cues, [], 'ordinary points and rallies are silent');
});

test('the winner side keeps cheering when the match ends, and the big applause plays once', () => {
  const crowd = createCrowd();
  const end = crowd.update({ phase: 'finished', winner: 'right' }, [{ type: 'score', side: 'right' }], 100);
  assert.deepEqual(end.cues, ['applauseBig']);
  assert.equal(end.cheer.finale, true);
  assert.equal(crowd.update({ phase: 'finished', winner: 'right' }, [], 200, 'right').cheer.finale, true);
  assert.equal(crowd.update({ phase: 'live' }, [], 300, 'right').cheer, undefined, 'a new match starts calm');
});

test('a fourth touch makes spectators on the faulting side protest briefly and silently', () => {
  const crowd = createCrowd();
  const fault = { phase: 'between', eventText: touchLimitFault };
  const point = crowd.update(fault, [{ type: 'score', side: 'right' }], 100);
  assert.deepEqual(point.boo, { side: 'left', since: 100 });
  assert.deepEqual(point.cues, []);
  assert.equal(crowd.update(fault, [], 400).boo.since, 100, 'the same point does not restart the reaction');
  assert.equal(crowd.update(fault, [], 950).boo, undefined);
  assert.equal(crowd.update({ phase: 'between' }, [{ type: 'score', side: 'left' }], 1000).boo, undefined);
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

const scored = (crowd, side, score, now, extra = {}) =>
  crowd.update({ phase: 'between', score, pointsToWin: 11, ...extra }, [{ type: 'score', side }], now);

test('a comeback from three points down makes that side go wild, with a short applause', () => {
  const crowd = createCrowd();
  let now = 0;
  scored(crowd, 'right', { left: 0, right: 1 }, now += 100);
  scored(crowd, 'right', { left: 0, right: 2 }, now += 100);
  scored(crowd, 'right', { left: 0, right: 3 }, now += 100);
  for (const left of [1, 2]) assert.equal(scored(crowd, 'left', { left, right: 3 }, now += 100).cheer.big, undefined);
  const level = scored(crowd, 'left', { left: 3, right: 3 }, now += 100);
  assert.equal(level.cheer.big, true, 'caught up');
  assert.deepEqual(level.cues, ['applause']);
  assert.equal(scored(crowd, 'left', { left: 4, right: 3 }, now += 100).cheer.big, undefined, 'once, not every point after');
});

test('an ordinary close match has no comeback', () => {
  const crowd = createCrowd();
  let now = 0;
  const points = [['left', 1, 0], ['right', 1, 1], ['right', 1, 2], ['left', 2, 2], ['left', 3, 2]];
  for (const [side, left, right] of points) {
    assert.equal(scored(crowd, side, { left, right }, now += 100).cheer.big, undefined);
  }
});

test('match point: the stands lean in and stay still; when the match is over they let go', () => {
  const crowd = createCrowd();
  let now = 0;
  let state;
  for (let i = 0; i < 60; i++) state = crowd.update({ phase: 'live', score: { left: 4, right: 2 }, pointsToWin: 11 }, [], now += 16);
  assert.ok(state.mood.tension < 0.01, 'not yet');
  for (let i = 0; i < 90; i++) state = crowd.update({ phase: 'live', score: { left: 10, right: 7 }, pointsToWin: 11 }, [], now += 16);
  assert.ok(state.mood.tension > 0.9, 'holding their breath');
  for (let i = 0; i < 90; i++) state = crowd.update({ phase: 'finished', winner: 'left', score: { left: 11, right: 7 }, pointsToWin: 11 }, [], now += 16);
  assert.ok(state.mood.tension < 0.05, 'released');
});

test('a very long rally sometimes (not always) sets off a wave, once a match', () => {
  const rally = (crowd, start, score = { left: 1, right: 1 }) => {
    let state;
    let now = start;
    for (let i = 0; i < 16; i++) state = crowd.update({ phase: 'live', score }, [hit], now += 16);
    return { state, now };
  };
  const lucky = createCrowd({ random: () => 0 });
  let { state, now } = rally(lucky, 0);
  assert.ok(state.mood.wave >= 0 && state.mood.wave < 1, 'a wave is running');
  for (let i = 0; i < 200; i++) state = lucky.update({ phase: 'live', score: { left: 1, right: 1 } }, [], now += 16);
  assert.equal(state.mood.wave, undefined, 'it passes');
  lucky.update({ phase: 'between', score: { left: 2, right: 1 } }, [{ type: 'score', side: 'left' }], now += 16);
  ({ state } = rally(lucky, now, { left: 2, right: 1 }));
  assert.equal(state.mood.wave, undefined, 'not again in the same match');
  const unlucky = createCrowd({ random: () => 0.99 });
  assert.equal(rally(unlucky, 0).state.mood.wave, undefined, 'and not every time');
  const short = createCrowd({ random: () => 0 });
  let shortState;
  for (let i = 0; i < 10; i++) shortState = short.update({ phase: 'live' }, [hit], (i + 1) * 16);
  assert.equal(shortState.mood.wave, undefined, 'only very long rallies');
});
