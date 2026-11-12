import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEvent } from '../event-schema.js';
import { onRequestPost } from '../functions/event.js';
import { originSource } from '../origins.js';

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

const post = (body, env, origin = 'https://oddbirdle.pages.dev') => onRequestPost({
  request: new Request('https://oddbirdle.pages.dev/event', { method: 'POST', body, headers: origin ? { Origin: origin } : {} }), env
});

test('event endpoint writes one anonymous data point', async () => {
  const points = [];
  const env = { EVENTS: { writeDataPoint: point => points.push(point) } };
  const response = await post(JSON.stringify({ name: 'rematch', mode: 'cpu' }), env);
  assert.equal(response.status, 204);
  assert.deepEqual(points, [{ indexes: ['rematch'], blobs: ['rematch', 'cpu', '', '', '', '', 'site'], doubles: [1] }]);
  await post(JSON.stringify({ name: 'page_view', returning: 'no' }), env, 'https://html-classic.itch.zone');
  assert.equal(points.at(-1).blobs.at(-1), 'itch');
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

test('concurrency reads the last finished minute and the peaks', async () => {
  const { summarizeConcurrency } = await import('../scripts/stats.mjs');
  const now = new Date('2026-11-12T03:30:20Z');
  const text = summarizeConcurrency([
    { minute: '2026-11-11 15:10:00', n: '9' },
    { minute: '2026-11-12 03:28:00', n: '4' },
    { minute: '2026-11-12 03:29:00', n: '3' },
    { minute: '2026-11-12 03:30:00', n: '1' }
  ], now);
  assert.match(text, /지금 동시접속 3명/);
  assert.match(text, /오늘 최대 9명 \(00:10 KST\)/);
  assert.match(text, /기간 최대 9명 \(11-12 00:10 KST\)/);
  assert.match(summarizeConcurrency([]), /아직 데이터 없음/);
});

test('heartbeat only takes known screens', () => {
  assert.deepEqual(cleanEvent({ name: 'heartbeat', mode: 'menu' }), { name: 'heartbeat', mode: 'menu' });
  assert.equal(cleanEvent({ name: 'heartbeat', mode: 'settings' }), undefined);
});

test('only our site and the portals are allowed, by source', () => {
  assert.equal(originSource('https://oddbirdle.pages.dev'), 'site');
  assert.equal(originSource('https://abc123.oddbirdle.pages.dev'), 'site');
  assert.equal(originSource('https://games.crazygames.com'), 'crazygames');
  assert.equal(originSource('https://www.crazygames.com'), 'crazygames');
  assert.equal(originSource('https://html-classic.itch.zone'), 'itch');
  // The game's own host on CrazyGames is several levels deep; the iOS app uses its own scheme.
  assert.equal(originSource('https://cubes-2048-io.game-files.crazygames.com'), 'crazygames');
  assert.equal(originSource('https://app.crazygames.com'), 'crazygames');
  assert.equal(originSource('capacitor://app.crazygames.com'), 'crazygames');
  assert.equal(originSource('capacitor://evil.crazygames.com'), undefined);
  assert.equal(originSource('capacitor://app.crazygames.com.evil.test'), undefined);
  assert.equal(originSource('http://html-classic.itch.zone'), undefined);
  assert.equal(originSource('https://crazygames.com.evil.test'), undefined);
  assert.equal(originSource('https://notcrazygames.com'), undefined);
  assert.equal(originSource(null), undefined);
});

test('events from unknown origins are refused and their host is noted', async () => {
  const points = [];
  const env = { EVENTS: { writeDataPoint: point => points.push(point) } };
  assert.equal((await post(JSON.stringify({ name: 'link_copy' }), env, 'https://copycat.example')).status, 403);
  assert.deepEqual(points, [{ indexes: ['origin_rejected'], blobs: ['origin_rejected', 'copycat.example'], doubles: [1] }]);
  assert.equal((await post(JSON.stringify({ name: 'link_copy' }), env, null)).status, 403);
});

test('stats split visits by source and list refused hosts', async () => {
  const { summarize } = await import('../scripts/stats.mjs');
  const text = summarize([
    { name: 'page_view', returning: 'no', source: '', n: '3' },
    { name: 'page_view', returning: 'no', source: 'crazygames', n: '5' },
    { name: 'game_start', mode: 'cpu', level: 'random', source: 'itch', n: '2' },
    { name: 'origin_rejected', mode: 'games.example.com', n: '4' }
  ]);
  assert.match(text, /출처별 방문: site 3 · crazygames 5 · itch 0/);
  assert.match(text, /출처별 게임 시작: site 0 · crazygames 0 · itch 2/);
  assert.match(text, /거절된 출처: games.example.com 4/);
});

test('quick match events are accepted and summarized', async () => {
  assert.deepEqual(cleanEvent({ name: 'quick_match_enter' }), { name: 'quick_match_enter' });
  assert.deepEqual(cleanEvent({ name: 'game_start', mode: 'online', via: 'quick' }), { name: 'game_start', mode: 'online', via: 'quick' });
  const { summarize } = await import('../scripts/stats.mjs');
  const text = summarize([
    { name: 'quick_match_enter', n: '10' }, { name: 'quick_match_found', n: '4' },
    { name: 'quick_match_start', n: '4' }, { name: 'quick_match_abort', n: '1' }
  ]);
  assert.match(text, /QUICK MATCH 누름 10, 매칭 4 \(매칭 성사율 40%\), 시작 4, 중간 이탈 1/);
});
