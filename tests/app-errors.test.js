import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrorReporter, placeOf } from '../app-errors.js';
import { createTestDb } from '../app-server/test-db.js';
import { createHandler } from '../app-server/src/index.js';
import { clean, parseReport } from '../app-server/src/errors.js';
import { clean as cleanOld } from '../app-server/src/users.js';

test('the app sends an error once, at most a few per launch, and nothing without a message', () => {
  const sent = [];
  const report = createErrorReporter({ send: item => sent.push(item), platform: 'ios', version: '1.1(2)', mode: () => 'solo', limit: 3 });
  assert.equal(report(new Error('boom'), 'client.js:10'), true);
  assert.equal(report(new Error('boom'), 'client.js:10'), false, 'the same error is not sent twice');
  assert.equal(report('other', 'a.js:1'), true);
  assert.equal(report('third', 'a.js:2'), true);
  assert.equal(report('fourth', 'a.js:3'), false, 'the limit per launch');
  assert.equal(report(undefined), false);
  assert.equal(report({}), false);
  assert.deepEqual(sent[0], { message: 'boom', place: 'client.js:10', platform: 'ios', version: '1.1(2)', mode: 'solo' });
  assert.equal(sent.length, 3);
});

test('the place is a file and a line, never a path', () => {
  const error = { stack: 'Error: x\n    at foo (https://app.oddbirdle/assets/client.js:123:45)\n    at bar (https://app.oddbirdle/game.js:9:1)' };
  assert.equal(placeOf(error), 'client.js:123');
  assert.equal(placeOf({}, 'fallback'), 'fallback');
});

test('the server cleans a report of addresses, e-mails and long numbers, and cuts it short', () => {
  assert.equal(clean('failed at https://x.example/a?token=abc for me@example.com id 0123456789abcdef0123 n 12345678', 200),
    'failed at <url> for <email> id <id> n <n>');
  assert.equal(clean('word '.repeat(100), 200).length, 200);
  assert.equal(parseReport({ message: '   ' }), undefined);
  assert.equal(parseReport('nope'), undefined);
  const parsed = parseReport({ message: 'm', place: 'x.js:1', platform: 'plan9', version: '1.0', mode: 'weird' });
  assert.equal(parsed.platform, 'web');
  assert.equal(parsed.mode, 'other');
  assert.ok(cleanOld);
});

function server() {
  const db = createTestDb();
  const clock = { now: Date.UTC(2026, 10, 26, 3) };
  const handle = createHandler({ now: () => clock.now });
  const env = { DB: db, DELETE_CODE_KEY: 'k', TOKEN_KEY: 't', GOOGLE_SERVER_CLIENT_ID: 'g', APPLE_BUNDLE_ID: 'com.yoyoyo.oddbirdle' };
  const call = (body, address = '10.1.1.1') => handle(new Request('https://oddbirdle.pages.dev/api/app/v1/error', {
    method: 'POST', headers: { origin: 'capacitor://app.oddbirdle', 'cf-connecting-ip': address }, body: JSON.stringify(body)
  }), env).then(async response => ({ status: response.status, body: await response.json() }));
  return { db, call, clock };
}

test('the server counts the same error on one row and keeps nothing about the person', async () => {
  const { db, call } = server();
  for (let i = 0; i < 3; i++) assert.equal((await call({ message: 'Cannot read x of undefined', place: 'client.js:7', platform: 'android', version: '1.1(3)', mode: 'online' }, '10.2.2.' + i)).status, 200);
  await call({ message: 'Another', place: 'game.js:2', platform: 'ios', version: '1.1(3)', mode: 'menu' });
  const rows = (await db.prepare('SELECT * FROM errors ORDER BY message').all()).results;
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.message === 'Cannot read x of undefined').count, 3);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['count', 'first_seen', 'last_seen', 'message', 'mode', 'place', 'platform', 'signature', 'version']);
  assert.equal((await call({ nothing: true })).status, 400);
});

test('too many error reports from one address in an hour are refused', async () => {
  const { call } = server();
  let last;
  for (let i = 0; i < 32; i++) last = await call({ message: 'm' + i, platform: 'ios' }, '10.3.3.3');
  assert.equal(last.status, 429);
});
