import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms, lagWindowMs } from '../rooms.js';

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
}

test('the server echoes a ping so a client can measure its round trip', () => {
  const rooms = createRooms(limit => limit - 1);
  const peer = new FakePeer();
  rooms.attach(peer);
  peer.say({ type: 'ping', t: 1234.5 });
  peer.say({ type: 'ping', t: 'soon' });
  peer.say({ type: 'ping' });
  assert.deepEqual(peer.sent, [{ type: 'pong', t: 1234.5 }]);
  peer.close();
});

test('the lag window covers a phone on mobile data (buffer up to 250ms plus the trip)', () => {
  assert.ok(lagWindowMs >= 500);
});

test('each player is told the other one\'s connection report, and only sensible ones, not too often', () => {
  const rooms = createRooms(limit => limit - 1);
  const a = new FakePeer();
  const b = new FakePeer();
  rooms.attach(a);
  rooms.attach(b);
  a.say({ type: 'create' });
  const code = a.sent.find(message => message.code)?.code;
  b.say({ type: 'join', code });
  a.sent.length = 0;
  b.sent.length = 0;
  a.say({ type: 'link', level: 2, rtt: 130 });
  assert.deepEqual(b.sent.filter(message => message.type === 'peer-link'), [{ type: 'peer-link', level: 2, rtt: 130 }]);
  assert.equal(a.sent.filter(message => message.type === 'peer-link').length, 0, 'not echoed back');
  a.say({ type: 'link', level: 1, rtt: 400 });
  assert.equal(b.sent.filter(message => message.type === 'peer-link').length, 1, 'a second one right away is dropped');
  b.say({ type: 'link', level: 9, rtt: 5 });
  assert.equal(a.sent.filter(message => message.type === 'peer-link').length, 0, 'nonsense is ignored');
  a.close();
  b.close();
});
