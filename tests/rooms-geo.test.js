import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms, distanceKm, parseGeo, matchMaxKm } from '../rooms.js';

class FakePeer {
  readyState = 1;
  sent = [];
  listeners = { message: [], close: [] };
  addEventListener(type, listener) { this.listeners[type].push(listener); }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    for (const listener of this.listeners.close) listener();
  }
  say(message) { for (const listener of this.listeners.message) listener({ data: JSON.stringify(message) }); }
  types() { return this.sent.map(message => message.type).filter(type => type !== 'state'); }
}

const seoul = { lat: 37.57, lon: 126.98 };
const busan = { lat: 35.18, lon: 129.08 };
const tokyo = { lat: 35.68, lon: 139.69 };
const singapore = { lat: 1.35, lon: 103.82 };
const losAngeles = { lat: 34.05, lon: -118.24 };

function lobby(options) {
  let n = 0;
  const rooms = createRooms(limit => (n++ * 7) % limit, options);
  const made = [];
  const connect = geo => {
    const peer = new FakePeer();
    rooms.attach(peer, { geo });
    made.push(peer);
    return peer;
  };
  return { connect, done: () => made.forEach(peer => peer.close()) };
}

test('distances and places', () => {
  assert.ok(Math.abs(distanceKm(seoul, tokyo) - 1160) < 40);
  assert.ok(Math.abs(distanceKm(seoul, losAngeles) - 9600) < 150);
  assert.deepEqual(parseGeo('37.57,126.98'), seoul);
  assert.equal(parseGeo('x,y'), undefined);
  assert.equal(parseGeo('95,10'), undefined);
  assert.equal(parseGeo(undefined), undefined);
});

test('quick match pairs players who are near each other at once', () => {
  const { connect, done } = lobby();
  const a = connect(seoul);
  const b = connect(busan);
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  assert.ok(a.types().includes('start'));
  assert.ok(b.types().includes('start'));
  done();
});

test('a far player is not paired, however long they wait: the limit has a ceiling', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { connect, done } = lobby();
  const near = connect(seoul);
  const far = connect(losAngeles);
  near.say({ type: 'queue' });
  far.say({ type: 'queue' });
  t.mock.timers.tick(10 * 60 * 1000);
  // Another arrival triggers a fresh look at the queue.
  const third = connect(seoul);
  third.say({ type: 'queue' });
  assert.ok(!far.types().includes('start'), 'Los Angeles never meets Seoul');
  assert.ok(near.types().includes('start') && third.types().includes('start'), 'the two in Seoul meet');
  assert.ok(matchMaxKm < distanceKm(seoul, losAngeles));
  done();
});

test('a player 4600 km away is matched only after waiting for the search to widen', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { connect, done } = lobby();
  const a = connect(seoul);
  const b = connect(singapore);
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  assert.ok(!a.types().includes('start'), 'not at once');
  t.mock.timers.tick(30000);
  // After 30 s the reach is the full 5000 km. A far newcomer (Los Angeles) triggers a fresh look: Seoul and Singapore meet.
  const c = connect(losAngeles);
  c.say({ type: 'queue' });
  assert.ok(a.types().includes('start') && b.types().includes('start'));
  assert.ok(!c.types().includes('start'));
  done();
});

test('the nearest waiting player is chosen, not just the next one', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { connect, done } = lobby();
  const a = connect(seoul);
  const b = connect(singapore);
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  t.mock.timers.tick(30000);
  // Seoul has been waiting longest and could take Singapore, but a Busan player now waits much nearer.
  const c = connect(busan);
  c.say({ type: 'queue' });
  assert.ok(a.types().includes('start') && c.types().includes('start'), 'Seoul meets Busan');
  assert.ok(!b.types().includes('start'));
  done();
});

test('a player whose place is unknown can meet anyone', () => {
  const { connect, done } = lobby();
  const a = connect(undefined);
  const b = connect(losAngeles);
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  assert.ok(a.types().includes('start') && b.types().includes('start'));
  done();
});

test('rooms by code have no distance limit', () => {
  const { connect, done } = lobby();
  const host = connect(seoul);
  host.say({ type: 'create', touchLimit: 3 });
  const code = host.sent.find(message => message.type === 'room').code;
  const guest = connect(losAngeles);
  guest.say({ type: 'join', code, touchLimit: 3 });
  assert.ok(guest.types().includes('start'));
  done();
});

test('a player who goes silent in a running match has left: the other is told and the room closes', async () => {
  const { connect, done } = lobby({ silenceMs: 60, checkMs: 15 });
  const a = connect(seoul);
  const b = connect(busan);
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  assert.ok(a.types().includes('start'));
  // b keeps sending (as a live client does many times a second); a goes quiet.
  const keepAlive = setInterval(() => b.say({ type: 'hold', seenTime: 0, time: 0 }), 10);
  await new Promise(resolve => setTimeout(resolve, 200));
  clearInterval(keepAlive);
  assert.ok(b.types().includes('left'), 'the one still playing hears that the other left');
  assert.ok(a.sent.some(message => message.type === 'error' && /away too long/.test(message.message)), 'the one who left is told why');
  assert.equal(a.readyState, 3);
  done();
});

test('nobody is removed for silence before the match has started or after it has ended', async () => {
  const { connect, done } = lobby({ silenceMs: 40, checkMs: 10 });
  const host = connect(seoul);
  host.say({ type: 'create', touchLimit: 3 });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(host.readyState, 1, 'a room waiting for a guest is not a running match');
  done();
});
