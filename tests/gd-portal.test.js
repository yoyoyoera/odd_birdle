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
