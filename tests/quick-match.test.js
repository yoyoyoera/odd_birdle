import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from '../rooms.js';

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

function lobby() {
  let n = 0;
  const rooms = createRooms(limit => (n++ * 7) % limit);
  const made = [];
  const connect = () => {
    const peer = new FakePeer();
    rooms.attach(peer);
    made.push(peer);
    return peer;
  };
  // Closing every connection stops the lobby's timers so the test can end.
  const done = () => made.forEach(peer => peer.close());
  return { connect, done };
}

test('two waiting players are seated in one room straight away', () => {
  const { connect, done } = lobby();
  const a = connect();
  const b = connect();
  a.say({ type: 'queue' });
  assert.deepEqual(a.types(), ['queued']);
  b.say({ type: 'queue' });
  const startA = a.sent.find(m => m.type === 'start');
  const startB = b.sent.find(m => m.type === 'start');
  assert.equal(startA.side, 'left');
  assert.equal(startB.side, 'right');
  assert.equal(startA.code, startB.code);
  assert.match(startA.code, /^[A-Z0-9]{6}$/);
  // Seated players cannot queue again.
  a.say({ type: 'queue' });
  assert.equal(a.types().filter(type => type === 'queued').length, 1);
  done();
});

test('nobody is matched with themselves, and leaving the queue sticks', () => {
  const { connect, done } = lobby();
  const a = connect();
  a.say({ type: 'queue' });
  a.say({ type: 'queue' });
  assert.deepEqual(a.types(), ['queued']);
  a.say({ type: 'unqueue' });
  const b = connect();
  b.say({ type: 'queue' });
  assert.ok(!b.types().includes('start'));
  // a comes back (tab visible again) and is matched with b.
  a.say({ type: 'queue' });
  assert.ok(a.types().includes('start') && b.types().includes('start'));
  done();
});

test('a closed connection leaves the queue; making a room by code does too', () => {
  const { connect, done } = lobby();
  const a = connect();
  a.say({ type: 'queue' });
  a.close();
  const b = connect();
  b.say({ type: 'queue' });
  b.say({ type: 'create' });
  assert.ok(b.types().includes('room'));
  const c = connect();
  c.say({ type: 'queue' });
  assert.ok(!c.types().includes('start'), 'c must not be seated with a or b');
  done();
});

test('if the opponent leaves a quick match, the other player is told', () => {
  const { connect, done } = lobby();
  const a = connect();
  const b = connect();
  a.say({ type: 'queue' });
  b.say({ type: 'queue' });
  b.close();
  assert.ok(a.types().includes('left'));
  done();
});
