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
