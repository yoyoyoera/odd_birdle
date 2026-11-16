import test from 'node:test';
import assert from 'node:assert/strict';

const stage = { inert: false };
globalThis.location = new URL('https://html5.gamedistribution.com/test/index.html');
globalThis.document = {
  documentElement: { dataset: { portal: 'gamedistribution' } },
  querySelector: () => stage
};
globalThis.window = {
  oddbirdleGdEvents: [{ name: 'SDK_GAME_PAUSE' }, { name: 'SDK_GAME_START' }],
  oddbirdleGdReady: Promise.resolve()
};
const portal = await import('../portal.js');
const { track } = await import('../analytics.js');

test('GD processes early events, releases initial controls, and has no outside invites or play analytics', async () => {
  const states = [];
  portal.onPortalPause(value => states.push(value));
  await portal.initPortal();
  assert.deepEqual(states, [true, false]);
  assert.equal(stage.inert, false);
  assert.equal(portal.closedPortal, true);
  assert.equal(portal.portalInviteLink('AB12CD'), 'AB12CD');
  assert.equal(portal.serverBase, 'https://oddbirdle.pages.dev/');
  globalThis.fetch = () => assert.fail('GD must not send our analytics');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    sendBeacon: () => assert.fail('GD must not send our analytics')
  } });
  track('page_view');
  await portal.matchBreak();
  assert.equal(portal.isPaused(), false, 'SDK blocked: still playable');
});

test('GD requests one preroll then only finished-match replays at least two minutes apart', async t => {
  let now = 10000;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  window.gdsdk = { showAd: async () => { calls++; } };

  await portal.matchBreak();
  assert.equal(calls, 1, 'missing SDK earlier did not consume the initial request');
  await portal.matchBreak();
  await portal.matchBreak({ rematch: true });
  assert.equal(calls, 1, 'neither repeated entry nor immediate replay requests another ad');
  now += 119999;
  await portal.matchBreak({ rematch: true });
  assert.equal(calls, 1, 'one millisecond before the boundary is too soon');
  now++;
  await portal.matchBreak();
  assert.equal(calls, 1, 'mode changes and room entry do not request ads even after two minutes');
  await portal.matchBreak({ rematch: true });
  assert.equal(calls, 2, 'exactly two minutes and a replay click requests the next ad');
  await portal.matchBreak({ rematch: true });
  assert.equal(calls, 2, 'request resets the interval');
  now += 120000;
  delete window.gdsdk;
  await portal.matchBreak({ rematch: true });
  window.gdsdk = { showAd: async () => { calls++; } };
  await portal.matchBreak({ rematch: true });
  assert.equal(calls, 3, 'an unavailable SDK does not consume the next eligible break');
});
