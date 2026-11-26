import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccount } from '../app-account.js';
import { createDailyClient } from '../daily-client.js';

function memory() {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: key => items.delete(key), items };
}

// A tiny stand-in for the app server: only what the account code needs to be exercised.
function fakeServer() {
  const calls = [];
  const known = new Set();
  const fetcher = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/api/app/v1', '');
    const auth = options.headers.authorization;
    calls.push({ method: options.method, path, auth, body: options.body ? JSON.parse(options.body) : undefined });
    const reply = (body, status = 200) => ({ status, json: async () => body });
    if (path === '/guest') { known.add('g1'); return reply({ ok: true, userId: 'a'.repeat(32), secret: 's'.repeat(43), name: 'SwiftBird-123' }); }
    if (path === '/nonce') return reply({ ok: true, nonce: 'f'.repeat(32) });
    if (path !== '/guest' && !auth) return reply({ ok: false, reason: 'unauthorized' }, 401);
    if (path === '/daily') return reply({ ok: true, plan: { date: '2026-11-26', attempts: 5 }, attemptsUsed: 0, calendar: [], board: [] });
    if (path === '/login') return reply({ ok: true, userId: 'b'.repeat(32), secret: 't'.repeat(43), merged: true, name: 'Birdie' });
    if (path === '/me') return reply({ ok: true, name: 'SwiftBird-123', account: false });
    return reply({ ok: true });
  };
  return { calls, fetcher, known };
}

const make = (extra = {}) => {
  const storage = memory();
  const server = fakeServer();
  const account = createAccount({ base: 'https://example.test/', storage, request: server.fetcher, platform: 'ios', ...extra });
  return { storage, server, account };
};

test('the first ask makes a guest and keeps its secret on the device; later asks reuse it', async () => {
  const { account, server, storage } = make();
  const daily = createDailyClient({ request: account.daily });
  const state = await daily.today();
  assert.equal(state.plan.date, '2026-11-26');
  assert.deepEqual(server.calls.map(call => call.path), ['/guest', '/daily']);
  assert.equal(server.calls[1].auth, `Bearer ${'a'.repeat(32)}.${'s'.repeat(43)}`);
  assert.ok(storage.getItem('oddbirdle-app-user'));
  await daily.today();
  assert.equal(server.calls.filter(call => call.path === '/guest').length, 1);
});

test('a new launch finds the same player in storage', async () => {
  const first = make();
  await first.account.ensure();
  const second = createAccount({ base: 'https://example.test/', storage: first.storage, request: first.server.fetcher, platform: 'ios' });
  assert.equal(second.ready, true);
});

test('the daily client maps its calls onto the app server', async () => {
  const { account, server } = make();
  const daily = createDailyClient({ request: account.daily });
  await daily.start();
  await daily.finish('tok', { won: true, mine: 5, theirs: 1 });
  const paths = server.calls.map(call => call.method + ' ' + call.path);
  assert.deepEqual(paths.slice(1), ['POST /daily/start', 'POST /daily/finish']);
  assert.deepEqual(server.calls[2].body, { token: 'tok', won: true, mine: 5, theirs: 1 });
});

test('when the server does not know this device any more, a new guest is made and the call repeated', async () => {
  const { account, server, storage } = make();
  storage.setItem('oddbirdle-app-user', JSON.stringify({ userId: 'c'.repeat(32), secret: 'x'.repeat(43) }));
  let first = true;
  const real = server.fetcher;
  const account2 = createAccount({
    base: 'https://example.test/', storage, platform: 'ios',
    request: async (url, options) => {
      if (first && new URL(url).pathname.endsWith('/daily')) { first = false; return { status: 401, json: async () => ({ ok: false }) }; }
      return real(url, options);
    }
  });
  const state = await createDailyClient({ request: account2.daily }).today();
  assert.equal(state.plan.date, '2026-11-26');
  assert.equal(JSON.parse(storage.getItem('oddbirdle-app-user')).userId, 'a'.repeat(32));
  assert.ok(account);
});

test('with no connection the daily client sees an offline player and nothing is stored', async () => {
  const storage = memory();
  const account = createAccount({ base: 'https://example.test/', storage, request: async () => { throw new Error('offline'); }, platform: 'ios' });
  assert.equal(await createDailyClient({ request: account.daily }).today(), undefined);
  assert.equal(storage.getItem('oddbirdle-app-user'), null);
});

test('providers: Apple only on an iPhone, Google on both, none in a browser', () => {
  assert.deepEqual(make({ platform: 'ios' }).account.providers(), ['apple', 'google']);
  assert.deepEqual(make({ platform: 'android' }).account.providers(), ['google']);
  assert.deepEqual(make({ platform: 'web' }).account.providers(), []);
});

test('signing in: one-time value from the server, its hash goes to the provider, the token comes back to the server', async () => {
  const sent = [];
  const plugins = {
    SocialLogin: {
      initialize: async options => sent.push(['initialize', options]),
      login: async options => { sent.push(['login', options]); return { result: { idToken: 'the.id.token', authorizationCode: 'code-1' } }; },
      logout: async () => {}
    }
  };
  const { account, server, storage } = make({ plugins });
  const answer = await account.signIn('apple');
  assert.equal(answer.ok, true);
  assert.equal(answer.merged, true);
  assert.equal(sent[0][1].google.webClientId.endsWith('.apps.googleusercontent.com'), true);
  assert.equal(sent[0][1].apple.clientId, 'com.yoyoyo.oddbirdle');
  assert.equal(sent[1][1].provider, 'apple');
  assert.match(sent[1][1].options.nonce, /^[0-9a-f]{64}$/, 'the provider gets the hash, not the value');
  const login = server.calls.find(call => call.path === '/login');
  assert.equal(login.body.nonce, 'f'.repeat(32), 'the server gets the value itself');
  assert.equal(login.body.idToken, 'the.id.token');
  assert.equal(login.body.authorizationCode, 'code-1');
  assert.equal(JSON.parse(storage.getItem('oddbirdle-app-user')).userId, 'b'.repeat(32), 'this device now belongs to that account');
});

test('closing the sign-in window is a quiet cancel, and a refused sign-in says why', async () => {
  const cancelling = { SocialLogin: { initialize: async () => {}, login: async () => { throw new Error('The user canceled the sign-in flow (code 1001)'); } } };
  assert.equal((await make({ plugins: cancelling }).account.signIn('google')).reason, 'cancelled');
  const broken = { SocialLogin: { initialize: async () => {}, login: async () => { throw new Error('boom'); } } };
  assert.equal((await make({ plugins: broken }).account.signIn('google')).reason, 'failed');
  assert.equal((await make({ plugins: undefined }).account.signIn('google')).reason, 'unavailable');
  assert.equal((await make({ plugins: cancelling, platform: 'android' }).account.signIn('apple')).reason, 'unavailable');
});

test('signing out and deleting forget the device', async () => {
  const { account, storage } = make();
  await account.ensure();
  assert.ok(storage.getItem('oddbirdle-app-user'));
  await account.signOut();
  assert.equal(storage.getItem('oddbirdle-app-user'), null);
  await account.ensure();
  assert.ok(storage.getItem('oddbirdle-app-user'));
  assert.equal((await account.deleteMe()).ok, true);
  assert.equal(storage.getItem('oddbirdle-app-user'), null);
});
