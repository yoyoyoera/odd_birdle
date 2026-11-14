import test from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the GamePix SDK v3 that records what the game asks of it.
const calls = [];
const handlers = {};
let overlayRemoved = false;
globalThis.location = new URL('https://example.invalid/game/index.html');
globalThis.document = {
  documentElement: { dataset: { portal: 'gamepix' } },
  querySelector: () => ({ remove: () => { overlayRemoved = true; } })
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
  portal.loadingStart();
  await portal.loadingStop();
  assert.deepEqual(calls, ['loading 10', 'loading 100', 'loaded']);
  assert.ok(overlayRemoved);
  portal.setPlaying(true);
  portal.setPlaying(false);
  portal.setPlaying(true);
  assert.deepEqual(calls.slice(3), ['gameStart']);
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
