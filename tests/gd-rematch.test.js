import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from '../rooms.js';
import { originSource } from '../origins.js';

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

function finishedRoom(t, barrier, quick = false) {
  let time = 0;
  let tick;
  t.mock.method(Math, 'random', () => 0.1);
  t.mock.method(performance, 'now', () => time);
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { if (ms === 8) tick = fn; return ms; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const rooms = createRooms(() => 1);
  const a = new Peer(); const b = new Peer();
  rooms.attach(a); rooms.attach(b);
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

test('rooms without GD keep their existing single-click rematch', t => {
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
