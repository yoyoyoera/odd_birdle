import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeKeys, dailyFor, dayIndex, isDate, maxAttempts, minimumSeconds, utcDate } from '../daily-plan.js';

const addDays = (date, days) => utcDate(Date.parse(date + 'T00:00:00Z') + days * 86400000);

test('the same date always gives the same challenge, and the first day is #1', () => {
  assert.deepEqual(dailyFor('2026-11-19'), dailyFor('2026-11-19'));
  assert.equal(dailyFor('2026-11-19').number, 1);
  assert.equal(dailyFor('2026-11-20').number, 2);
  assert.equal(dayIndex('2026-11-19'), 0);
});

test('every challenge comes up once in each run of eight days, and never twice in a row', () => {
  for (let cycle = 0; cycle < 12; cycle++) {
    const keys = Array.from({ length: 8 }, (_, slot) => dailyFor(addDays('2026-11-19', cycle * 8 + slot)).key);
    assert.deepEqual([...keys].sort(), [...challengeKeys].sort(), `run ${cycle}`);
  }
  let previous;
  for (let day = 0; day < 200; day++) {
    const { key } = dailyFor(addDays('2026-11-19', day));
    assert.notEqual(key, previous, `day ${day} repeats ${key}`);
    previous = key;
  }
});

test('levels are 3 to 5, targets 5 to 10 (5 to 7 at level 5), Sudden Death one point and one try, Five in a Row five points', () => {
  for (let day = 0; day < 60; day++) {
    const plan = dailyFor(addDays('2026-11-19', day));
    assert.ok(plan.cpuLevel >= 3 && plan.cpuLevel <= 5);
    if (plan.key === 'five') assert.equal(plan.cpuLevel, 3);
    if (plan.key === 'sudden') assert.equal(plan.points, 1);
    else if (plan.key === 'five') assert.equal(plan.points, 5);
    else {
      assert.ok(plan.points >= 5 && plan.points <= (plan.cpuLevel === 5 ? 7 : 10), `${plan.key} lv${plan.cpuLevel} ${plan.points}`);
    }
    assert.equal(plan.attempts, plan.key === 'sudden' ? 1 : 5);
    assert.equal(maxAttempts(plan.key), plan.attempts);
    assert.ok(plan.points >= 1);
  }
});

test('dates are checked and the shortest possible win grows with the target', () => {
  assert.ok(isDate('2026-12-09') && !isDate('2026-13-40') && !isDate('yesterday') && !isDate(20261209));
  assert.ok(minimumSeconds(1) < minimumSeconds(5) && minimumSeconds(5) < minimumSeconds(11));
  assert.equal(utcDate(Date.parse('2026-11-19T23:59:59Z')), '2026-11-19');
  assert.equal(utcDate(Date.parse('2026-11-20T00:00:00Z')), '2026-11-20');
});

test('days before the first day still give a valid challenge', () => {
  const plan = dailyFor('2026-11-10');
  assert.ok(challengeKeys.includes(plan.key));
});

test('over time the targets and levels really vary for the same challenge', () => {
  const seen = new Map();
  for (let day = 0; day < 400; day++) {
    const plan = dailyFor(addDays('2026-11-19', day));
    if (plan.key !== 'windy') continue;
    (seen.get('points') ?? seen.set('points', new Set()).get('points')).add(plan.points);
    (seen.get('level') ?? seen.set('level', new Set()).get('level')).add(plan.cpuLevel);
  }
  assert.ok(seen.get('points').size >= 5, `targets seen: ${[...seen.get('points')]}`);
  assert.deepEqual([...seen.get('level')].sort(), [3, 4, 5]);
});
