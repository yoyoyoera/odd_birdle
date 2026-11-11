import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEvent } from '../event-schema.js';
import { onRequestPost } from '../functions/event.js';

test('only listed event names and values pass the filter', () => {
  assert.deepEqual(cleanEvent({ name: 'game_start', mode: 'cpu', level: 'random' }),
    { name: 'game_start', mode: 'cpu', level: 'random' });
  assert.deepEqual(cleanEvent({ name: 'game_finish', mode: 'cpu', level: 3, result: 'win' }),
    { name: 'game_finish', mode: 'cpu', level: '3', result: 'win' });
  assert.equal(cleanEvent({ name: 'game_start', mode: 'cpu', level: '9' }), undefined);
  // Unknown fields are dropped, never stored.
  assert.deepEqual(cleanEvent({ name: 'page_view', email: 'a@b.c' }), { name: 'page_view' });
  assert.equal(cleanEvent({ name: 'page_view', returning: 'maybe' }), undefined);
  assert.equal(cleanEvent({ name: 'toString' }), undefined);
  assert.equal(cleanEvent(null), undefined);
});

const post = (body, env) => onRequestPost({
  request: new Request('https://example.test/event', { method: 'POST', body }), env
});

test('event endpoint writes one anonymous data point', async () => {
  const points = [];
  const env = { EVENTS: { writeDataPoint: point => points.push(point) } };
  const response = await post(JSON.stringify({ name: 'rematch', mode: 'cpu' }), env);
  assert.equal(response.status, 204);
  assert.deepEqual(points, [{ indexes: ['rematch'], blobs: ['rematch', 'cpu', '', '', '', ''], doubles: [1] }]);
});

test('event endpoint rejects junk and survives a missing binding', async () => {
  assert.equal((await post('not json', {})).status, 400);
  assert.equal((await post(JSON.stringify({ name: 'login', user: 'x' }), {})).status, 400);
  assert.equal((await post(JSON.stringify({ name: 'link_copy' }), {})).status, 204);
  const throwing = { EVENTS: { writeDataPoint() { throw new Error('quota'); } } };
  assert.equal((await post(JSON.stringify({ name: 'room_create' }), throwing)).status, 204);
});

test('stats summary turns raw counts into rates', async () => {
  const { summarize } = await import('../scripts/stats.mjs');
  const rows = [
    { name: 'page_view', returning: 'no', n: '8' }, { name: 'page_view', returning: 'yes', n: '2' },
    { name: 'game_start', mode: 'cpu', level: 'random', n: '4' },
    { name: 'game_finish', mode: 'cpu', level: '3', result: 'win', n: '2' },
    { name: 'game_finish', mode: 'cpu', level: '4', result: 'lose', n: '1' },
    { name: 'rematch', mode: 'cpu', n: '1' }
  ];
  const text = summarize(rows);
  assert.match(text, /방문 10 \(재방문 2, 20%\)/);
  assert.match(text, /CPU 완주 3 \(완주율 75%\), 승 2/);
  assert.match(text, /재경기율 33%/);
});
