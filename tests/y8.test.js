import test from 'node:test';
import assert from 'node:assert/strict';

// Stand-ins for the page, and for the Y8 SDK that records what the game asks of it.
const windowEvents = {};
const documentEvents = {};
const document = {
  hidden: false,
  documentElement: { dataset: { portal: 'y8' } },
  addEventListener: (name, handler) => { documentEvents[name] = handler; }
};
globalThis.document = document;
globalThis.location = new URL('https://example.invalid/y8/index.html');
const calls = [];
let adBehaviour = 'normal';
globalThis.window = {
  addEventListener: (name, handler) => { windowEvents[name] = handler; },
  y8Sdk: {
    showAd(options) {
      calls.push(['showAd', options.type, options.name]);
      if (adBehaviour === 'reject') return Promise.reject(new Error('no ads'));
      if (adBehaviour === 'throw') throw new TypeError('adBreak is not a function');
      if (adBehaviour === 'skipped') {
        // A capped or empty break: neither before nor after, only the report.
        options.adBreakDone({ breakStatus: 'frequencyCapped' });
        return Promise.resolve();
      }
      options.beforeAd();
      calls.push(['during', portal.isPaused()]);
      options.afterAd();
      options.adBreakDone({ breakStatus: 'viewed' });
      return Promise.resolve();
    }
  }
};
const portal = await import('../portal.js');
const { track } = await import('../analytics.js');
await portal.initPortal();

test('losing focus or hiding the tab pauses and mutes; coming back resumes', () => {
  const states = [];
  portal.onPortalPause(value => states.push(value));
  assert.equal(portal.isPaused(), false);
  windowEvents.blur();
  assert.equal(portal.isPaused(), true);
  assert.equal(portal.portalMuted(), true);
  windowEvents.focus();
  assert.equal(portal.isPaused(), false);
  document.hidden = true;
  documentEvents.visibilitychange();
  assert.equal(portal.isPaused(), true);
  windowEvents.focus();
  assert.equal(portal.isPaused(), true, 'focus alone does not resume while the tab is still hidden');
  document.hidden = false;
  documentEvents.visibilitychange();
  assert.equal(portal.isPaused(), false);
  assert.deepEqual(states, [true, false, true, false]);
});

test('a "next" ad runs only between matches, every third match, and pauses just around the ad', async () => {
  await portal.matchBreak();
  assert.equal(calls.length, 0, 'no ad before any match');
  portal.matchEnded(true);
  portal.matchEnded(false);
  await portal.matchBreak();
  assert.equal(calls.length, 0, 'two matches are not enough');
  portal.matchEnded(true);
  await portal.matchBreak();
  assert.deepEqual(calls, [['showAd', 'next', 'match-end'], ['during', true]]);
  assert.equal(portal.isPaused(), false, 'resumed after the ad');
  portal.matchEnded(true);
  portal.matchEnded(true);
  portal.matchEnded(true);
  await portal.matchBreak();
  assert.equal(calls.filter(call => call[0] === 'showAd').length, 1, 'and not again within a few minutes');
});

test('a skipped, failing or missing ad never leaves the game paused or stuck', async () => {
  for (const behaviour of ['skipped', 'reject', 'throw']) {
    adBehaviour = behaviour;
    // Pretend the minutes have passed: only the match count and the time rule are under test elsewhere.
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * 60 * 1000 * (['skipped', 'reject', 'throw'].indexOf(behaviour) + 1) + 100000;
    portal.matchEnded(true); portal.matchEnded(true); portal.matchEnded(true);
    await portal.matchBreak();
    Date.now = realNow;
    assert.equal(portal.isPaused(), false, behaviour);
  }
  delete globalThis.window.y8Sdk;
  portal.matchEnded(true); portal.matchEnded(true); portal.matchEnded(true);
  await portal.matchBreak();
  assert.equal(portal.isPaused(), false, 'no SDK at all (blocked) is fine');
});

test('invites are just the room code and nothing is counted', () => {
  assert.equal(portal.portalInviteLink('AB12CD'), 'AB12CD');
  const sent = [];
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: url => { sent.push(url); return true; } }, configurable: true });
  globalThis.fetch = async url => { sent.push(url); };
  track('page_view', { returning: 'no' });
  assert.deepEqual(sent, []);
  assert.equal(portal.closedPortal, true);
});

test('an ad that outlasts the start timer cannot release rematch readiness early', async t => {
  t.mock.method(Date, 'now', () => 9999999999999);
  const timers = [];
  let cancelled = false;
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { timers.push({ fn, ms }); return 122 + timers.length; });
  t.mock.method(globalThis, 'clearTimeout', id => { if (id === 123) cancelled = true; });
  const timer = () => timers[0].fn();
  let options;
  window.y8Sdk = { showAd(value) { options = value; value.beforeAd(); return Promise.resolve(); } };
  portal.matchEnded(true); portal.matchEnded(true); portal.matchEnded(true);
  let ready = false;
  const waiting = portal.matchBreak().then(() => { ready = true; });
  assert.ok(cancelled, 'the no-start timer is cancelled once the ad starts');
  timer(); // Even a timer callback already queued before cancellation must be harmless.
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(portal.isPaused(), true);
  options.afterAd(); // Some SDKs report afterAd without a separate adBreakDone.
  await waiting;
  assert.equal(ready, true);
  assert.equal(portal.isPaused(), false);
  options.adBreakDone();
  assert.equal(portal.isPaused(), false);
});

test('an ad that never reports its end still gives the game back after the limit', async t => {
  t.mock.method(Date, 'now', () => 19999999999999);
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { timers.push({ fn, ms }); return timers.length; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  window.y8Sdk = { showAd(value) { value.beforeAd(); return new Promise(() => {}); } };
  portal.matchEnded(false); portal.matchEnded(false); portal.matchEnded(false);
  let ready = false;
  const waiting = portal.matchBreak().then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(portal.isPaused(), true, 'paused while the ad is up');
  const limit = timers.find(entry => entry.ms === portal.y8AdLimitMs);
  assert.ok(limit, 'a limit is set once the ad starts');
  limit.fn();
  await waiting;
  assert.equal(ready, true);
  assert.equal(portal.isPaused(), false);
});

test('a late Y8 ad can pause and resume after its rematch already started', async t => {
  t.mock.method(Date, 'now', () => 29999999999999);
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { timers.push({ fn, ms }); return timers.length; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  let options;
  window.y8Sdk = { showAd(value) { options = value; } };
  portal.matchEnded(false); portal.matchEnded(false); portal.matchEnded(false);
  const waiting = portal.matchBreak();
  timers.find(timer => timer.ms === portal.y8AdStartMs).fn();
  await waiting;
  options.beforeAd();
  assert.equal(portal.isPaused(), true);
  options.afterAd();
  assert.equal(portal.isPaused(), false, 'the late end must release the actual ad pause');
});

test('callbacks from an expired request cannot pause or release a newer Y8 ad', async t => {
  let clock = 39999999999999;
  t.mock.method(Date, 'now', () => clock);
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', fn => timers.push(fn));
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const requests = [];
  window.y8Sdk = { showAd(options) { requests.push(options); } };
  function requestBreak() {
    for (let i = 0; i < 3; i++) portal.matchEnded(false);
    return portal.matchBreak();
  }
  const first = requestBreak();
  timers[0]();
  await first;
  clock += 600000;
  const second = requestBreak();
  requests[0].beforeAd();
  assert.equal(portal.isPaused(), false);
  requests[1].beforeAd();
  requests[0].afterAd();
  assert.equal(portal.isPaused(), true);
  requests[1].adBreakDone();
  await second;
  requests[1].beforeAd();
  assert.equal(portal.isPaused(), false);
});
