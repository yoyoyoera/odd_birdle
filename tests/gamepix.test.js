import test from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the GamePix SDK v3 that records what the game asks of it.
const calls = [];
const handlers = {};
let overlayRemoved = false;
const stage = { inert: false };
const documentEvents = {};
globalThis.location = new URL('https://example.invalid/game/index.html');
globalThis.document = {
  hidden: false,
  documentElement: { dataset: { portal: 'gamepix' } },
  addEventListener: (name, handler) => { documentEvents[name] = handler; },
  querySelector: selector => selector === '#stage' ? stage : ({ remove: () => { overlayRemoved = true; } })
};
globalThis.window = { GamePix: {
  events: { on: (name, handler) => { handlers[name] = handler; } },
  lifecycle: {
    loading: percent => calls.push('loading ' + percent),
    loaded: async () => { calls.push('loaded'); return {}; },
    gameStart: () => { calls.push('gameStart'); return true; }
  },
  ads: { interstitial: async () => { calls.push('interstitial'); return { success: true }; } },
  happyMoment: type => calls.push('happy ' + type),
  sadMoment: type => calls.push('sad ' + type)
} };
const portal = await import('../portal.js');
const { track } = await import('../analytics.js');

test('GamePix loading goes in order, the game starts once, and the loading cover goes away', async () => {
  await portal.initPortal();
  assert.equal(stage.inert, true, 'controls wait for the loading handshake');
  portal.loadingStart();
  await portal.loadingStop();
  assert.deepEqual(calls, ['loading 10', 'loading 100', 'loaded']);
  assert.ok(overlayRemoved);
  assert.equal(stage.inert, false);
  portal.setPlaying(true);
  portal.setPlaying(false);
  portal.setPlaying(true);
  assert.deepEqual(calls.slice(3), ['gameStart']);
});

test('hidden tabs pause without overriding an active SDK pause on return', () => {
  document.hidden = true;
  documentEvents.visibilitychange();
  assert.equal(portal.isPaused(), true);
  assert.equal(portal.portalMuted(), true);
  handlers.pause();
  document.hidden = false;
  documentEvents.visibilitychange();
  assert.equal(portal.isPaused(), true, 'an ad still owns the pause');
  handlers.resume();
  assert.equal(portal.isPaused(), false);
});

test('pause and resume stop the game and mute the sound, and repeats do nothing more', () => {
  const heard = [];
  const paused = [];
  portal.onPortalMute(muted => heard.push(muted));
  portal.onPortalPause(value => paused.push(value));
  assert.equal(portal.portalMuted(), false);
  handlers.pause();
  handlers.pause();
  assert.equal(portal.isPaused(), true);
  assert.equal(portal.portalMuted(), true);
  handlers.resume();
  handlers.resume();
  assert.equal(portal.portalMuted(), false);
  assert.deepEqual(paused, [true, false]);
  assert.deepEqual(heard, [true, false]);
});

test('invites are just the room code, and nothing is counted or sent out', () => {
  assert.equal(portal.portalInviteLink('AB12CD'), 'AB12CD');
  const sent = [];
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: url => { sent.push(url); return true; } }, configurable: true });
  globalThis.fetch = async url => { sent.push(url); };
  track('page_view', { returning: 'no' });
  assert.deepEqual(sent, []);
});

test('GamePix sound callbacks mute audio independently and preserve overlapping pauses', () => {
  const sdk = window.GamePix;
  sdk.soundOff();
  assert.equal(portal.portalMuted(), true);
  assert.equal(portal.isPaused(), false, 'turning sound off does not pause a match');
  handlers.pause();
  sdk.soundOn();
  assert.equal(portal.portalMuted(), true, 'soundOn cannot override an active pause');
  handlers.resume();
  assert.equal(portal.portalMuted(), false);
  sdk.soundOff();
  handlers.pause();
  handlers.resume();
  assert.equal(portal.portalMuted(), true, 'resume cannot override the player mute');
  sdk.soundOn();
  assert.equal(portal.portalMuted(), false);
});

test('an ad is offered only between matches: every third match, and not twice in a few minutes', async () => {
  calls.length = 0;
  await portal.matchBreak();
  assert.deepEqual(calls, [], 'no ad before any match was played');
  portal.matchEnded(true);
  portal.matchEnded(false);
  await portal.matchBreak();
  assert.deepEqual(calls, ['happy match_won', 'sad match_lost'], 'two matches is not enough');
  portal.matchEnded(true);
  await portal.matchBreak();
  assert.deepEqual(calls.slice(3), ['interstitial']);
  portal.matchEnded(true);
  portal.matchEnded(true);
  portal.matchEnded(true);
  await portal.matchBreak();
  assert.equal(calls.filter(call => call === 'interstitial').length, 1, 'not again within a few minutes');
});

test('a long GamePix ad holds readiness until its Promise resolves; a rejected ad allows play', async t => {
  t.mock.method(Date, 'now', () => 9999999999999);
  let complete;
  t.mock.method(window.GamePix.ads, 'interstitial', () => {
    handlers.pause();
    return new Promise(resolve => { complete = () => { handlers.resume(); resolve({ success: true }); }; });
  });
  portal.matchEnded(true); portal.matchEnded(true); portal.matchEnded(true);
  let ready = false;
  const pending = portal.matchBreak().then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(portal.isPaused(), true);
  complete();
  await pending;
  assert.equal(ready, true);
  assert.equal(portal.isPaused(), false);
  t.mock.method(Date, 'now', () => 9999999999999 + 180000);
  t.mock.method(window.GamePix.ads, 'interstitial', () => Promise.reject(new Error('no fill')));
  portal.matchEnded(true); portal.matchEnded(true); portal.matchEnded(true);
  await portal.matchBreak();
  assert.equal(portal.isPaused(), false);
});

test('an unavailable SDK releases the loading cover and controls without an ad', async () => {
  const sdk = window.GamePix;
  delete window.GamePix;
  overlayRemoved = false;
  try {
    const fallback = await import('../portal.js?gamepix-sdk-blocked');
    await fallback.initPortal();
    assert.equal(stage.inert, true);
    await fallback.loadingStop();
    assert.equal(stage.inert, false);
    assert.equal(overlayRemoved, true);
    fallback.matchEnded(true); fallback.matchEnded(true); fallback.matchEnded(true);
    await fallback.matchBreak();
    assert.equal(fallback.isPaused(), false);
  } finally { window.GamePix = sdk; }
});
