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

test('levels stay in 2 to 4, Sudden Death allows one try and the rest five', () => {
  for (let day = 0; day < 60; day++) {
    const plan = dailyFor(addDays('2026-11-19', day));
    assert.ok(plan.cpuLevel >= 2 && plan.cpuLevel <= 4);
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
