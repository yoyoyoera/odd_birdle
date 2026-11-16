import test from 'node:test';
import assert from 'node:assert/strict';

// A browser stand-in: the address and a small storage, to try the ?me=1 switch.
const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: key => stored.delete(key) };
globalThis.document = { documentElement: { dataset: {} }, title: 'ODD BIRDLE' };
const sent = [];
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: url => { sent.push(url); return true; } }, configurable: true });
globalThis.fetch = async url => { sent.push(url); };

async function load(search) {
  globalThis.location = new URL('https://oddbirdle.pages.dev/' + search);
  return import('../analytics.js?x=' + Math.random());
}

test('normally an event is sent', async () => {
  const { track, mine } = await load('');
  assert.equal(mine, false);
  track('page_view', { returning: 'no' });
  assert.equal(sent.length, 1);
});

test('?me=1 turns your device off in the numbers, in this browser, and the title says so', async () => {
  sent.length = 0;
  const first = await load('?me=1');
  assert.equal(first.mine, true);
  assert.match(document.title, /\(stats off\)/);
  first.track('page_view', { returning: 'no' });
  assert.equal(sent.length, 0);
  // Later visits without the address part are still off.
  document.title = 'ODD BIRDLE';
  const later = await load('');
  assert.equal(later.mine, true);
  later.track('game_start', { mode: 'cpu', level: '3' });
  assert.equal(sent.length, 0);
});

test('?me=0 puts the device back in the numbers', async () => {
  const back = await load('?me=0');
  assert.equal(back.mine, false);
  back.track('page_view', { returning: 'yes' });
  assert.equal(sent.length, 1);
});
