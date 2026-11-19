import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyClient, monthDays } from '../daily-client.js';

const answer = (status, body) => async () => ({ status, json: async () => body });

test('today returns the server state, or nothing when the server cannot be reached', async () => {
  const state = { plan: { key: 'windy' }, attemptsUsed: 1, calendar: [] };
  assert.deepEqual(await createDailyClient({ request: answer(200, state) }).today(), state);
  assert.equal(await createDailyClient({ request: answer(503, { error: 'x' }) }).today(), undefined);
  assert.equal(await createDailyClient({ request: async () => { throw new Error('offline'); } }).today(), undefined);
});

test('start and finish pass the server answer through, and a dead server is "offline"', async () => {
  const started = { ok: true, token: 't', attempt: 1, plan: { key: 'windy' } };
  assert.deepEqual(await createDailyClient({ request: answer(200, started) }).start(), started);
  assert.deepEqual(await createDailyClient({ request: answer(409, { ok: false, reason: 'no-attempts' }) }).start(), { ok: false, reason: 'no-attempts', state: undefined });
  assert.deepEqual(await createDailyClient({ request: async () => { throw new Error('x'); } }).start(), { ok: false, reason: 'offline' });
  const sent = [];
  const client = createDailyClient({ request: async (url, options) => { sent.push([url, JSON.parse(options.body)]); return { status: 200, json: async () => ({ ok: true, cleared: true, record: { rank: 2 } }) }; } });
  assert.deepEqual(await client.finish('tok', { won: true, mine: 5, theirs: 1 }), { ok: true, cleared: true, record: { rank: 2 } });
  assert.deepEqual(sent[0], ['/api/daily/finish', { token: 'tok', won: true, mine: 5, theirs: 1 }]);
  assert.deepEqual(await createDailyClient({ request: answer(400, { ok: false, reason: 'too-fast' }) }).finish('t', { won: true, mine: 1, theirs: 0 }), { ok: false, reason: 'too-fast' });
});

test('the month grid starts on the right weekday and marks the cleared days', () => {
  const { offset, days } = monthDays('2026-12-02', ['2026-12-02', '2026-11-30', '2026-12-25']);
  assert.equal(days.length, 31);
  assert.equal(offset, 1, '1 December 2026 is a Tuesday (Monday = 0)');
  assert.deepEqual(days.filter(entry => entry.cleared).map(entry => entry.day), [2, 25]);
});
