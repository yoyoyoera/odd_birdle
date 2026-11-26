import test from 'node:test';
import assert from 'node:assert/strict';

// The Android app build as portal.js and analytics.js see it: <html data-portal="app">.
const sent = [];
// Not localhost (which analytics.js leaves out anyway): the app has to be left out on its own.
globalThis.location = new URL('https://app.invalid/');
globalThis.document = { title: 'ODD BIRDLE', visibilityState: 'visible', documentElement: { dataset: { portal: 'app', features: '' } } };
globalThis.window = {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (...args) => { sent.push(args); return true; } }, configurable: true });
globalThis.fetch = (...args) => { sent.push(args); return Promise.resolve(); };
const portal = await import('../portal.js');
const { track, trackVisit } = await import('../analytics.js');
const { features } = await import('../features.js');

test('the app counts nothing and keeps invites to the room code', async () => {
  assert.equal(portal.portal, 'app');
  assert.equal(portal.closedPortal, true);
  assert.equal(portal.coordinatedBreak, false);
  track('game_start', { mode: 'cpu', level: '1' });
  trackVisit();
  assert.deepEqual(sent, []);
  assert.equal(portal.portalInviteLink('AB12CD'), 'AB12CD');
  await portal.initPortal();
  await portal.matchBreak();
  assert.deepEqual(features, { stages: false, daily: false, online: false, shop: false });
});

test('the app pause pauses and mutes the game, and lets go again', () => {
  const pauses = [];
  const mutes = [];
  portal.onPortalPause(value => pauses.push(value));
  portal.onPortalMute(value => mutes.push(value));
  portal.setAppPaused(true);
  assert.equal(portal.isPaused(), true);
  assert.equal(portal.portalMuted(), true);
  portal.setAppPaused(true);
  portal.setAppPaused(false);
  assert.equal(portal.isPaused(), false);
  assert.equal(portal.portalMuted(), false);
  assert.deepEqual(pauses, [true, false]);
  assert.deepEqual(mutes, [true, false]);
});
