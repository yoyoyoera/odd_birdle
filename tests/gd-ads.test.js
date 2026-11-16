import test from 'node:test';
import assert from 'node:assert/strict';
import { createGdAds } from '../gd-ads.js';

test('an actual GD ad pauses and mutes until the player clicks Continue', async () => {
  const states = [];
  let closeAd;
  let continueGame;
  let prompts = 0;
  let calls = 0;
  const ads = createGdAds({
    getSdk: () => ({ showAd() { calls++; return new Promise(resolve => { closeAd = resolve; }); } }),
    pause: value => states.push(value),
    showContinue: () => { prompts++; return new Promise(resolve => { continueGame = resolve; }); }
  });
  let done = false;
  const wait = ads.request().then(() => { done = true; });
  const repeated = ads.request();
  assert.equal(calls, 1);
  ads.event({ name: 'SDK_GAME_PAUSE' });
  closeAd();
  ads.event({ name: 'SDK_GAME_START' });
  await Promise.resolve();
  assert.equal(prompts, 1, 'SDK event and promise completion must not create two prompts');
  assert.equal(done, false);
  assert.equal(states.at(-1), true);
  continueGame();
  await Promise.all([wait, repeated]);
  assert.equal(states.at(-1), false);
});

test('missing, blocked, capped and throwing SDKs do not trap the player', async () => {
  for (const getSdk of [() => undefined, () => ({}), () => ({ showAd: () => Promise.resolve() }),
    () => ({ showAd: () => Promise.reject(new Error('blocked')) }),
    () => ({ showAd() { throw new Error('offline'); } })]) {
    const states = [];
    const ads = createGdAds({ getSdk, pause: value => states.push(value), showContinue: () => assert.fail('no ad was shown') });
    await ads.request();
    assert.notEqual(states.at(-1), true);
  }
});

test('event-only SDKs, errors and absent callbacks release the wait', async () => {
  for (const ending of ['SDK_GAME_START', 'SDK_ERROR', 'AD_ERROR', 'timeout']) {
    const states = [];
    const ads = createGdAds({ getSdk: () => ({ showAd() {} }), pause: value => states.push(value),
      showContinue: async () => {}, timeoutMs: 5 });
    const wait = ads.request();
    if (ending !== 'timeout') ads.event({ name: ending });
    await wait;
    assert.equal(states.at(-1), false);
  }
});
