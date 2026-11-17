import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from '../rooms.js';
import { originSource, requiresRematchReady } from '../origins.js';

class Peer {
  readyState = 1;
  sent = [];
  listeners = {};
  addEventListener(type, handler) { this.listeners[type] = handler; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  say(message) { this.listeners.message({ data: JSON.stringify(message) }); }
  close() { this.readyState = 3; this.listeners.close(); }
  starts() { return this.sent.filter(message => message.type === 'start'); }
}

function finishedRoom(t, barrier, quick = false, legacyPortalSide) {
  let time = 0;
  let tick;
  t.mock.method(Math, 'random', () => 0.1);
  t.mock.method(performance, 'now', () => time);
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { if (ms === 8) tick = fn; return ms; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const rooms = createRooms(() => 1);
  const a = new Peer(); const b = new Peer();
  rooms.attach(a, { restartBarrier: legacyPortalSide === 'left' });
  rooms.attach(b, { restartBarrier: legacyPortalSide === 'right' });
  if (quick) {
    a.say({ type: 'queue', restartBarrier: barrier });
    b.say({ type: 'queue' });
  } else {
    a.say({ type: 'create', restartBarrier: barrier });
    b.say({ type: 'join', code: a.sent[0].code });
  }
  for (let i = 0; i < 30000 && a.sent.at(-1)?.state?.phase !== 'finished'; i++) {
    time += 16;
    tick();
  }
  assert.equal(a.sent.at(-1).state.phase, 'finished');
  return { a, b };
}

for (const quick of [false, true]) {
  test(`GD ${quick ? 'quick' : 'code'} rematch waits for both players; duplicate and stale requests cannot restart it`, t => {
    const { a, b } = finishedRoom(t, true, quick);
    const round = a.starts()[0].round;
    a.say({ type: 'restart', round });
    a.say({ type: 'restart', round });
    assert.equal(a.starts().length, 1);
    assert.deepEqual(a.sent.at(-1), { type: 'rematch_wait', round, ready: true });
    assert.deepEqual(b.sent.at(-1), { type: 'rematch_wait', round, ready: false });
    b.say({ type: 'restart', round: round - 1 });
    assert.equal(b.starts().length, 1);
    b.say({ type: 'restart', round });
    assert.equal(a.starts().length, 2);
    assert.equal(b.starts().length, 2);
    assert.equal(a.starts()[1].round, round + 1);
    assert.equal(a.starts()[1].state.eventText, '3');
    a.say({ type: 'restart', round });
    assert.equal(a.starts().length, 2);
    a.close();
  });
}

test('rooms outside the coordinated sources keep their existing single-click rematch', t => {
  const { a, b } = finishedRoom(t, false);
  a.say({ type: 'restart' });
  assert.equal(a.starts().length, 2);
  assert.equal(b.starts().length, 2);
  a.close();
});

test('only the official GD game host is allowed, including strict HTTPS', () => {
  assert.equal(originSource('https://html5.gamedistribution.com'), 'gamedistribution');
  assert.equal(originSource('https://revision.gamedistribution.com'), 'gamedistribution');
  for (const host of ['http://html5.gamedistribution.com', 'https://gamedistribution.com.evil.test',
    'https://evil.gamedistribution.com']) assert.equal(originSource(host), undefined);
});

for (const side of ['left', 'right']) {
  test(`server protects a submitted legacy Y8 ${side} peer without any client update`, t => {
    // These peers both send the old protocol: no capability flag and no round identifier.
    const { a, b } = finishedRoom(t, false, false, side);
    const portalPeer = side === 'left' ? a : b;
    const websitePeer = side === 'left' ? b : a;
    websitePeer.say({ type: 'restart' });
    websitePeer.say({ type: 'restart' });
    assert.equal(a.starts().length, 1, 'website replay cannot start while portal peer watches an ad');
    assert.equal(b.starts().length, 1);
    // Actual Y8 code awaits its ad before sending precisely this message.
    portalPeer.say({ type: 'restart' });
    assert.equal(a.starts().length, 2);
    assert.equal(b.starts().length, 2);
    assert.equal(a.starts()[1].state.eventText, '3');
    a.close();
  });
}

test('website, itch and ad-portal Origins all require both players to be ready', () => {
  for (const host of ['https://item-cdn.y8.com', 'https://revision.gamedistribution.com', 'https://html5.gamedistribution.com',
    'https://gamepix.com', 'https://games.gamepix.com', 'https://preview.games.gamepix.com',
    'https://oddbirdle.pages.dev', 'https://html-classic.itch.zone', 'https://studiyo.itch.io']) {
    assert.equal(requiresRematchReady(host), true);
  }
  for (const host of ['https://evil.test', 'https://oddbirdle.pages.dev.evil.test', null]) {
    assert.equal(requiresRematchReady(host), false);
  }
});

test('GamePix allows HTTPS subdomains without accepting lookalike domains', () => {
  for (const origin of ['https://gamepix.com', 'https://games.gamepix.com', 'https://preview.games.gamepix.com']) {
    assert.equal(originSource(origin), 'gamepix');
  }
  for (const origin of ['http://games.gamepix.com', 'https://gamepix.com.evil.test', 'https://fakegamepix.com',
    'https://gamepix.com@evil.test', 'null', null]) {
    assert.equal(originSource(origin), undefined);
  }
});
