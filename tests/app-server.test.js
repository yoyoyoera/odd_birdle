import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../app-server/test-db.js';
import { createHandler } from '../app-server/src/index.js';
import { forgetKeys } from '../app-server/src/login.js';
import { checkNickname } from '../app-server/src/nickname.js';
import { aliasFor } from '../app-server/src/alias.js';
import { clean } from '../app-server/src/users.js';
import { seal, open } from '../app-server/src/apple.js';
import { dailyFor, minimumSeconds, utcDate } from '../daily-plan.js';
import { toBase64Url, sha256Hex } from '../app-server/src/util.js';

const origin = 'https://app.oddbirdle';
const env = (db, extra = {}) => ({
  DB: db, DELETE_CODE_KEY: 'test-delete-key', TOKEN_KEY: 'test-token-key',
  GOOGLE_SERVER_CLIENT_ID: 'google-web-client', APPLE_BUNDLE_ID: 'com.yoyoyo.oddbirdle', ...extra
});

function server(extra = {}, fetcher) {
  const db = createTestDb();
  const clock = { now: Date.UTC(2026, 10, 26, 3, 0, 0) };
  const handle = createHandler({ now: () => clock.now, fetcher });
  let ip = 0;
  const e = env(db, extra);
  async function call(method, path, { auth, body, headers = {}, address } = {}) {
    const response = await handle(new Request('https://oddbirdle.pages.dev/api/app/v1' + path, {
      method,
      headers: { origin, 'cf-connecting-ip': address ?? `10.0.0.${++ip % 250}`, ...(auth ? { authorization: `Bearer ${auth.userId}.${auth.secret}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    }), e);
    return { status: response.status, body: await response.json().catch(() => undefined), headers: response.headers };
  }
  const guest = async () => (await call('POST', '/guest')).body;
  return { db, clock, call, guest, env: e, handle };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a guest gets an id, a secret and an alias, and can ask for today', async () => {
  const { call, guest } = server();
  const g = await guest();
  assert.equal(g.ok, true);
  assert.match(g.userId, /^[0-9a-f]{32}$/);
  assert.equal(g.name, aliasFor(g.userId));
  assert.match(g.name, /^[A-Za-z]+-\d{3}$/);
  const today = await call('GET', '/daily', { auth: g });
  assert.equal(today.status, 200);
  assert.equal(today.body.plan.date, '2026-11-26');
  assert.equal(today.body.attemptsUsed, 0);
  assert.deepEqual(today.body.board, []);
  assert.equal(today.body.me.account, false);
  const bad = await call('GET', '/daily', { auth: { userId: g.userId, secret: 'x'.repeat(43) } });
  assert.equal(bad.status, 401);
  assert.equal((await call('GET', '/daily')).status, 401);
});

test('starting a try counts it and gives a token; the tries run out', async () => {
  const { call, guest, clock } = server();
  const g = await guest();
  const plan = dailyFor(utcDate(clock.now));
  for (let i = 1; i <= plan.attempts; i++) {
    const start = await call('POST', '/daily/start', { auth: g });
    assert.equal(start.body.ok, true);
    assert.equal(start.body.attempt, i);
    assert.ok(start.body.token);
  }
  const more = await call('POST', '/daily/start', { auth: g });
  assert.equal(more.status, 409);
  assert.equal(more.body.reason, 'no-attempts');
  assert.equal(more.body.state.attemptsUsed, plan.attempts);
});

test('many starts at once use no more than the tries allowed', async () => {
  const { call, guest, clock } = server();
  const g = await guest();
  const plan = dailyFor(utcDate(clock.now));
  const answers = await Promise.all(Array.from({ length: plan.attempts + 6 }, () => call('POST', '/daily/start', { auth: g })));
  assert.equal(answers.filter(answer => answer.body.ok).length, plan.attempts);
  const tokens = new Set(answers.filter(answer => answer.body.ok).map(answer => answer.body.token));
  assert.equal(tokens.size, plan.attempts, 'every try has its own token');
  const today = await call('GET', '/daily', { auth: g });
  assert.equal(today.body.attemptsUsed, plan.attempts);
});

async function clearDaily(ctx, g, { wait: seconds } = {}) {
  const plan = dailyFor(utcDate(ctx.clock.now));
  const start = await ctx.call('POST', '/daily/start', { auth: g });
  assert.equal(start.body.ok, true);
  ctx.clock.now += (seconds ?? minimumSeconds(plan.points) + 5) * 1000;
  const finish = await ctx.call('POST', '/daily/finish', { auth: g, body: { token: start.body.token, won: true, mine: plan.points, theirs: 1 } });
  return { start, finish, plan };
}

test('a clear gets its place in the day, shows on the board, and closes the day for that player', async () => {
  const ctx = server();
  const a = await ctx.guest();
  const b = await ctx.guest();
  const first = await clearDaily(ctx, a);
  assert.equal(first.finish.body.cleared, true);
  assert.equal(first.finish.body.record.rank, 1);
  assert.equal(first.finish.body.fresh, true);
  const second = await clearDaily(ctx, b);
  assert.equal(second.finish.body.record.rank, 2);
  const today = await ctx.call('GET', '/daily', { auth: a });
  assert.equal(today.body.cleared.rank, 1);
  assert.deepEqual(today.body.board.map(entry => entry.rank), [1, 2]);
  assert.equal(today.body.board[0].name, aliasFor(a.userId));
  assert.deepEqual(today.body.calendar, ['2026-11-26']);
  const again = await ctx.call('POST', '/daily/start', { auth: a });
  assert.equal(again.body.reason, 'cleared');
});

test('finishing again with the same token gives the same answer (a lost reply is harmless)', async () => {
  const ctx = server();
  const g = await ctx.guest();
  const plan = dailyFor(utcDate(ctx.clock.now));
  const start = await ctx.call('POST', '/daily/start', { auth: g });
  ctx.clock.now += (minimumSeconds(plan.points) + 4) * 1000;
  const body = { token: start.body.token, won: true, mine: plan.points, theirs: 0 };
  const one = await ctx.call('POST', '/daily/finish', { auth: g, body });
  const two = await ctx.call('POST', '/daily/finish', { auth: g, body });
  const three = await ctx.call('POST', '/daily/finish', { auth: g, body: { ...body, won: false } });
  assert.deepEqual(two.body, one.body);
  assert.deepEqual(three.body, one.body, 'a later claim cannot change the first result');
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM clears').first()).n, 1);
  assert.equal((await ctx.db.prepare('SELECT count FROM day_counters').first()).count, 1);
});

test('two tries finishing at once make one clear and no gap in the places', async () => {
  const ctx = server();
  const g = await ctx.guest();
  const other = await ctx.guest();
  const plan = dailyFor(utcDate(ctx.clock.now));
  const t1 = await ctx.call('POST', '/daily/start', { auth: g });
  const t2 = await ctx.call('POST', '/daily/start', { auth: g });
  ctx.clock.now += (minimumSeconds(plan.points) + 4) * 1000;
  const [a, b] = await Promise.all([t1, t2].map(t => ctx.call('POST', '/daily/finish', { auth: g, body: { token: t.body.token, won: true, mine: plan.points, theirs: 2 } })));
  assert.equal(a.body.record.rank, 1);
  assert.equal(b.body.record.rank, 1);
  assert.equal([a, b].filter(answer => answer.body.fresh).length, 1, 'only one of them made the clear');
  const next = await clearDaily(ctx, other);
  assert.equal(next.finish.body.record.rank, 2, 'the next player gets place 2, not 3');
});

test('a result that is too fast, or does not add up, is refused', async () => {
  const ctx = server();
  const g = await ctx.guest();
  const plan = dailyFor(utcDate(ctx.clock.now));
  const quick = await ctx.call('POST', '/daily/start', { auth: g });
  ctx.clock.now += 1000;
  const fast = await ctx.call('POST', '/daily/finish', { auth: g, body: { token: quick.body.token, won: true, mine: plan.points, theirs: 0 } });
  assert.equal(fast.body.reason, 'too-fast');
  const odd = await ctx.call('POST', '/daily/start', { auth: g });
  ctx.clock.now += 60000;
  const wrong = await ctx.call('POST', '/daily/finish', { auth: g, body: { token: odd.body.token, won: true, mine: plan.points - 1, theirs: 0 } });
  assert.equal(wrong.body.reason, 'bad-result');
  const lost = await ctx.call('POST', '/daily/start', { auth: g });
  const nope = await ctx.call('POST', '/daily/finish', { auth: g, body: { token: lost.body.token, won: false, mine: 1, theirs: 5 } });
  assert.equal(nope.body.cleared, false);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM clears').first()).n, 0);
  const alien = await ctx.call('POST', '/daily/finish', { auth: g, body: { token: 'nope', won: true, mine: 5, theirs: 0 } });
  assert.equal(alien.body.reason, 'bad-token');
});

test('a token belongs to its player and its day', async () => {
  const ctx = server();
  const a = await ctx.guest();
  const b = await ctx.guest();
  const plan = dailyFor(utcDate(ctx.clock.now));
  const start = await ctx.call('POST', '/daily/start', { auth: a });
  ctx.clock.now += 40000;
  const stolen = await ctx.call('POST', '/daily/finish', { auth: b, body: { token: start.body.token, won: true, mine: plan.points, theirs: 0 } });
  assert.equal(stolen.body.reason, 'bad-token');
  // Over midnight UTC the try still counts for the day it started.
  ctx.clock.now = Date.UTC(2026, 10, 26, 23, 59, 50);
  const late = await ctx.call('POST', '/daily/start', { auth: a });
  ctx.clock.now = Date.UTC(2026, 10, 27, 0, 0, 40);
  const done = await ctx.call('POST', '/daily/finish', { auth: a, body: { token: late.body.token, won: true, mine: plan.points, theirs: 0 } });
  assert.equal(done.body.cleared, true);
  assert.equal(done.body.record.date, '2026-11-26');
});

test('the day changes at midnight UTC: new tries and a new count', async () => {
  const ctx = server();
  const g = await ctx.guest();
  await clearDaily(ctx, g);
  ctx.clock.now = Date.UTC(2026, 10, 27, 0, 5, 0);
  const next = await ctx.call('GET', '/daily', { auth: g });
  assert.equal(next.body.plan.date, '2026-11-27');
  assert.equal(next.body.cleared, undefined);
  assert.equal(next.body.attemptsUsed, 0);
  assert.deepEqual(next.body.calendar, ['2026-11-26']);
  const second = await clearDaily(ctx, g);
  assert.equal(second.finish.body.record.rank, 1, 'each day counts from place 1');
});

test('nicknames: only for accounts, with rules, a filter, and one change a day', () => {
  assert.equal(checkNickname('ab').ok, false);
  assert.equal(checkNickname('a'.repeat(17)).ok, false);
  assert.equal(checkNickname('12345').ok, false, 'digits alone');
  assert.equal(checkNickname('bad name').ok, false, 'no spaces');
  assert.equal(checkNickname('Birdie_9').ok, true);
  assert.equal(checkNickname('셔틀콕왕').ok, true);
  assert.equal(checkNickname('sh1thead').reason, 'nickname-banned');
  assert.equal(checkNickname('FUCKer').reason, 'nickname-banned');
  assert.equal(checkNickname('시발이').reason, 'nickname-banned');
  assert.equal(checkNickname('Admin_Bird').reason, 'nickname-banned');
});

// ---- sign in -------------------------------------------------------------------------------------------------------

async function signer(kid) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const encode = value => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  return {
    jwk,
    async token(claims, header = {}) {
      const signing = encode({ alg: 'RS256', kid, ...header }) + '.' + encode(claims);
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(signing));
      return signing + '.' + toBase64Url(signature);
    }
  };
}

async function signInSetup(extra = {}) {
  forgetKeys();
  const google = await signer('g1');
  const apple = await signer('a1');
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('googleapis.com')) return new Response(JSON.stringify({ keys: [google.jwk] }));
    if (String(url).endsWith('/auth/keys')) return new Response(JSON.stringify({ keys: [apple.jwk] }));
    if (String(url).endsWith('/auth/token')) return new Response(JSON.stringify({ refresh_token: 'apple-refresh-1' }));
    if (String(url).endsWith('/auth/revoke')) return new Response('', { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const ctx = server(extra, fetcher);
  const login = async ({ provider = 'google', sub = 'sub-1', auth, mutate = {}, nonceMutate, sign = provider === 'google' ? google : apple, code }) => {
    const nonce = (await ctx.call('POST', '/nonce')).body.nonce;
    const seconds = Math.floor(ctx.clock.now / 1000);
    const claims = {
      iss: provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com',
      aud: provider === 'google' ? 'google-web-client' : 'com.yoyoyo.oddbirdle',
      sub, iat: seconds, exp: seconds + 3600, nonce: await sha256Hex(nonceMutate ?? nonce), ...mutate
    };
    const idToken = await sign.token(claims);
    return ctx.call('POST', '/login', { auth, body: { provider, idToken, nonce, authorizationCode: code } });
  };
  return { ...ctx, google, apple, calls, login };
}

test('signing in turns the guest into an account and keeps their records', async () => {
  const ctx = await signInSetup();
  const g = await ctx.guest();
  await clearDaily(ctx, g);
  const answer = await ctx.login({ auth: g });
  assert.equal(answer.body.ok, true);
  assert.equal(answer.body.account, true);
  assert.equal(answer.body.userId, g.userId, 'the same player');
  const me = await ctx.call('GET', '/me', { auth: g });
  assert.equal(me.body.account, true);
  assert.equal(me.body.name, aliasFor(g.userId));
  const nick = await ctx.call('PUT', '/me/nickname', { auth: g, body: { nickname: 'Birdie_9' } });
  assert.equal(nick.body.ok, true);
  assert.equal((await ctx.call('GET', '/daily', { auth: g })).body.board[0].name, 'Birdie_9');
  assert.equal((await ctx.call('PUT', '/me/nickname', { auth: g, body: { nickname: 'Another' } })).body.reason, 'nickname-taken-today');
  ctx.clock.now += 25 * 3600 * 1000;
  assert.equal((await ctx.call('PUT', '/me/nickname', { auth: g, body: { nickname: 'Another' } })).body.ok, true);
  assert.equal((await ctx.call('PUT', '/me/nickname', { auth: g, body: { nickname: 'shit' } })).status, 429, 'once a day');
});

test('a guest cannot choose a nickname', async () => {
  const ctx = server();
  const g = await ctx.guest();
  const answer = await ctx.call('PUT', '/me/nickname', { auth: g, body: { nickname: 'Birdie_9' } });
  assert.equal(answer.status, 403);
  assert.equal(answer.body.reason, 'login-required');
});

test('a token with the wrong audience, a wrong or used nonce, an old date or a bad signature is refused', async () => {
  const ctx = await signInSetup();
  const g = await ctx.guest();
  assert.equal((await ctx.login({ auth: g, mutate: { aud: 'someone-else' } })).body.reason, 'bad-token');
  assert.equal((await ctx.login({ auth: g, mutate: { iss: 'https://evil.example' } })).body.reason, 'bad-token');
  assert.equal((await ctx.login({ auth: g, mutate: { exp: Math.floor(ctx.clock.now / 1000) - 10 } })).body.reason, 'bad-token');
  assert.equal((await ctx.login({ auth: g, nonceMutate: 'a different value' })).body.reason, 'bad-token');
  const other = await signer('g1');
  assert.equal((await ctx.login({ auth: g, sign: other })).body.reason, 'bad-token', 'signed by a key that is not the provider\'s');
  const nonce = (await ctx.call('POST', '/nonce')).body.nonce;
  const seconds = Math.floor(ctx.clock.now / 1000);
  const idToken = await ctx.google.token({ iss: 'https://accounts.google.com', aud: 'google-web-client', sub: 's', iat: seconds, exp: seconds + 3600, nonce: await sha256Hex(nonce) });
  assert.equal((await ctx.call('POST', '/login', { auth: g, body: { provider: 'google', idToken, nonce } })).body.ok, true);
  const again = await ctx.call('POST', '/login', { auth: g, body: { provider: 'google', idToken, nonce } });
  assert.equal(again.body.reason, 'bad-nonce', 'a one-time value works once');
  assert.equal((await ctx.call('POST', '/login', { auth: g, body: { provider: 'google', idToken: 'nope', nonce: 'zz' } })).status, 400);
});

test('signing in on a second device joins the guest records to the account; the better place stays', async () => {
  const ctx = await signInSetup();
  const phone = await ctx.guest();
  await clearDaily(ctx, phone);                        // place 1 on 11-26
  await ctx.login({ auth: phone, sub: 'same-person' });
  ctx.clock.now = Date.UTC(2026, 10, 27, 3, 0, 0);
  const tablet = await ctx.guest();
  const rival = await ctx.guest();
  await clearDaily(ctx, rival);                        // place 1 on 11-27
  await clearDaily(ctx, tablet);                       // place 2 on 11-27
  const joined = await ctx.login({ auth: tablet, sub: 'same-person' });
  assert.equal(joined.body.ok, true);
  assert.equal(joined.body.merged, true);
  assert.equal(joined.body.userId, phone.userId, 'the account that signed in first');
  assert.ok(joined.body.secret, 'a secret for this device');
  assert.equal((await ctx.call('GET', '/me', { auth: tablet })).status, 401, 'the old guest is gone');
  const account = { userId: joined.body.userId, secret: joined.body.secret };
  const today = await ctx.call('GET', '/daily', { auth: account });
  assert.deepEqual(today.body.calendar, ['2026-11-26', '2026-11-27']);
  assert.equal(today.body.cleared.rank, 2);
  // The same day on both: the better place stays.
  const b = await ctx.guest();
  const a = await ctx.guest();
  await ctx.call('POST', '/daily/start', { auth: a });
});

test('the same day cleared on two devices keeps the better place', async () => {
  const ctx = await signInSetup();
  const first = await ctx.guest();
  const second = await ctx.guest();
  await clearDaily(ctx, second);                        // place 1
  await clearDaily(ctx, first);                         // place 2
  await ctx.login({ auth: first, sub: 'p' });           // first becomes the account (place 2)
  const joined = await ctx.login({ auth: second, sub: 'p' });
  assert.equal(joined.body.userId, first.userId);
  const account = { userId: first.userId, secret: joined.body.secret };
  const today = await ctx.call('GET', '/daily', { auth: account });
  assert.equal(today.body.cleared.rank, 1, 'place 1 from the other device');
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM clears').first()).n, 1);
});

test('an account must sign out before signing in as someone else', async () => {
  const ctx = await signInSetup();
  const g = await ctx.guest();
  await ctx.login({ auth: g, sub: 'one' });
  const other = await ctx.login({ auth: g, sub: 'two', provider: 'apple' });
  assert.equal(other.status, 409);
  assert.equal(other.body.reason, 'already-signed-in');
});

test('reports: three different players hide a nickname and lock it', async () => {
  const ctx = await signInSetup();
  const star = await ctx.guest();
  await ctx.login({ auth: star, sub: 'star' });
  await ctx.call('PUT', '/me/nickname', { auth: star, body: { nickname: 'Annoying' } });
  await clearDaily(ctx, star);
  const reporters = [await ctx.guest(), await ctx.guest(), await ctx.guest()];
  for (const [index, reporter] of reporters.entries()) {
    const answer = await ctx.call('POST', '/report', { auth: reporter, body: { date: '2026-11-26', rank: 1 } });
    assert.equal(answer.body.ok, true);
    const board = (await ctx.call('GET', '/daily', { auth: reporter })).body.board;
    assert.equal(board[0].name, index < 2 ? 'Annoying' : aliasFor(star.userId));
  }
  // The same reporter twice counts once.
  const me = await ctx.call('GET', '/me', { auth: star });
  assert.equal(me.body.nicknameLocked, true);
  assert.equal((await ctx.call('PUT', '/me/nickname', { auth: star, body: { nickname: 'Fresh_start' } })).body.reason, 'nickname-locked');
  assert.equal((await ctx.call('POST', '/report', { auth: star, body: { date: '2026-11-26', rank: 1 } })).body.reason, 'own-name');
  assert.equal((await ctx.call('POST', '/report', { auth: reporters[0], body: { date: '2026-11-26', rank: 4 } })).status, 404);
});

test('the same player reporting twice is one report', async () => {
  const ctx = await signInSetup();
  const star = await ctx.guest();
  await ctx.login({ auth: star, sub: 'star' });
  await ctx.call('PUT', '/me/nickname', { auth: star, body: { nickname: 'Annoying' } });
  await clearDaily(ctx, star);
  const reporter = await ctx.guest();
  for (let i = 0; i < 5; i++) await ctx.call('POST', '/report', { auth: reporter, body: { date: '2026-11-26', rank: 1 } });
  assert.equal((await ctx.call('GET', '/me', { auth: star })).body.nicknameLocked, false);
});

test('delete from the app removes the player and the board line', async () => {
  const ctx = server();
  const a = await ctx.guest();
  const b = await ctx.guest();
  await clearDaily(ctx, a);
  await clearDaily(ctx, b);
  assert.equal((await ctx.call('DELETE', '/me', { auth: a })).body.ok, true);
  assert.equal((await ctx.call('GET', '/daily', { auth: a })).status, 401);
  const board = (await ctx.call('GET', '/daily', { auth: b })).body.board;
  assert.deepEqual(board.map(entry => entry.rank), [2], 'the other places do not move');
  for (const table of ['users', 'devices', 'clears', 'attempts', 'tokens']) {
    const left = await ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = ?1`).bind(a.userId).first();
    assert.equal(left.n, 0, table + ' is empty for the deleted player');
  }
});

test('delete with the code from the web page, for a guest or an account, with no sign-in', async () => {
  const ctx = server();
  const g = await ctx.guest();
  await clearDaily(ctx, g);
  const code = (await ctx.call('GET', '/me/delete-code', { auth: g })).body.code;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await ctx.call('GET', '/me/delete-code', { auth: g })).body.code, code, 'the same code every time');
  assert.equal((await ctx.call('POST', '/delete', { body: { code: 'AAAA-BBBB-CCCC' } })).status, 404);
  const done = await ctx.call('POST', '/delete', { body: { code: code.toLowerCase().replaceAll('-', ' ') } });
  assert.equal(done.body.ok, true);
  assert.equal((await ctx.call('GET', '/me', { auth: g })).status, 401);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM clears').first()).n, 0);
});

test('deleting an Apple account asks Apple to end the link; the refresh token is kept only sealed', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const ctx = await signInSetup({ APPLE_TEAM_ID: 'TEAMID1234', APPLE_KEY_ID: 'KEYID12345', APPLE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----` });
  const g = await ctx.guest();
  const answer = await ctx.login({ auth: g, provider: 'apple', sub: 'apple-1', code: 'auth-code' });
  assert.equal(answer.body.ok, true);
  const stored = await ctx.db.prepare('SELECT refresh_token_enc FROM identities').first();
  assert.ok(stored.refresh_token_enc && !stored.refresh_token_enc.includes('apple-refresh-1'), 'sealed, not plain');
  assert.equal(await open(ctx.env, stored.refresh_token_enc), 'apple-refresh-1');
  const exchange = ctx.calls.find(call => call.url.endsWith('/auth/token'));
  const form = new URLSearchParams(exchange.options.body);
  assert.equal(form.get('client_id'), 'com.yoyoyo.oddbirdle');
  assert.equal(form.get('code'), 'auth-code');
  const [header, claims, signature] = form.get('client_secret').split('.');
  const decoded = part => JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.equal(decoded(header).kid, 'KEYID12345');
  assert.equal(decoded(claims).iss, 'TEAMID1234');
  assert.equal(decoded(claims).sub, 'com.yoyoyo.oddbirdle');
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(header + '.' + claims)), true);
  await ctx.call('DELETE', '/me', { auth: g });
  const revoke = ctx.calls.find(call => call.url.endsWith('/auth/revoke'));
  assert.ok(revoke, 'Apple was told');
  assert.equal(new URLSearchParams(revoke.options.body).get('token'), 'apple-refresh-1');
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM identities').first()).n, 0);
});

test('sealing needs the right key', async () => {
  const sealed = await seal({ TOKEN_KEY: 'one' }, 'secret value');
  assert.equal(await open({ TOKEN_KEY: 'one' }, sealed), 'secret value');
  assert.equal(await open({ TOKEN_KEY: 'two' }, sealed), undefined);
});

test('guests nobody used for 90 days are cleaned away, accounts and recent guests stay', async () => {
  const ctx = await signInSetup();
  const old = await ctx.guest();
  const account = await ctx.guest();
  await ctx.login({ auth: account, sub: 'keeper' });
  await clearDaily(ctx, old);
  ctx.clock.now += 91 * 24 * 3600 * 1000;
  const fresh = await ctx.guest();
  const removed = await clean(ctx.db, ctx.clock.now);
  assert.equal(removed, 1);
  assert.equal((await ctx.call('GET', '/me', { auth: old })).status, 401);
  assert.equal((await ctx.call('GET', '/me', { auth: fresh })).status, 200);
  assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?1').bind(account.userId).first()).n, 1);
});

test('only the app and our own pages may call it, and the answer allows exactly that origin', async () => {
  const ctx = server();
  const ok = await ctx.call('POST', '/guest', { headers: { origin: 'capacitor://app.oddbirdle' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'capacitor://app.oddbirdle');
  const preflight = await ctx.handle(new Request('https://oddbirdle.pages.dev/api/app/v1/daily', { method: 'OPTIONS', headers: { origin: 'https://app.oddbirdle' } }), ctx.env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
  const evil = await ctx.call('POST', '/guest', { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 404);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.equal((await ctx.handle(new Request('https://oddbirdle.pages.dev/api/other'), ctx.env)).status, 404);
});

test('too many new guests from one address are slowed down', async () => {
  const ctx = server();
  let last;
  for (let i = 0; i < 22; i++) last = await ctx.call('POST', '/guest', { address: '203.0.113.9' });
  assert.equal(last.status, 429);
  assert.equal((await ctx.call('POST', '/guest', { address: '203.0.113.10' })).status, 200, 'another address is fine');
  ctx.clock.now += 3700 * 1000;
  assert.equal((await ctx.call('POST', '/guest', { address: '203.0.113.9' })).status, 200, 'and the hour passes');
});

test('signing out forgets this device only', async () => {
  const ctx = await signInSetup();
  const g = await ctx.guest();
  await ctx.login({ auth: g, sub: 'x' });
  const second = await ctx.login({ sub: 'x' });
  const device2 = { userId: second.body.userId, secret: second.body.secret };
  assert.equal((await ctx.call('GET', '/me', { auth: device2 })).status, 200);
  assert.equal((await ctx.call('POST', '/logout', { auth: device2 })).body.ok, true);
  assert.equal((await ctx.call('GET', '/me', { auth: device2 })).status, 401);
  assert.equal((await ctx.call('GET', '/me', { auth: g })).status, 200);
  await wait(0);
});
