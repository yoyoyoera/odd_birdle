import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from '../rooms.js';
import { threeTouchLimit } from '../game.js';

class Peer {
  readyState = 1;
  sent = [];
  listeners = {};
  addEventListener(type, handler) { this.listeners[type] = handler; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  say(message) { this.listeners.message({ data: JSON.stringify(message) }); }
  close() { this.readyState = 3; this.listeners.close(); }
  sides() { return this.sent.filter(message => message.type === 'start').map(message => message.side); }
}

function room(t, coin, quick = false, [hostLimit, guestLimit] = []) {
  let time = 0;
  let tick;
  t.mock.method(performance, 'now', () => time);
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { if (ms === 8) tick = fn; return ms; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  // The coin is randomIndex(2); room codes use the same function.
  const rooms = createRooms(limit => (limit === 2 ? coin : 0));
  const a = new Peer(); const b = new Peer();
  rooms.attach(a);
  rooms.attach(b);
  if (quick) {
    a.say({ type: 'queue', touchLimit: hostLimit });
    b.say({ type: 'queue', touchLimit: guestLimit });
  } else {
    a.say({ type: 'create', touchLimit: hostLimit });
    b.say({ type: 'join', code: a.sent[0].code, touchLimit: guestLimit });
  }
  const finish = () => {
    for (let i = 0; i < 30000 && a.sent.at(-1)?.state?.phase !== 'finished'; i++) {
      time += 16;
      tick();
    }
    assert.equal(a.sent.at(-1).state.phase, 'finished');
  };
  return { a, b, finish, tick: () => { time += 16; tick(); } };
}

for (const quick of [false, true]) {
  test(`${quick ? 'quick match' : 'room code'}: the first match's sides follow the coin`, t => {
    assert.deepEqual(room(t, 0, quick).a.sides(), ['left']);
    t.mock.restoreAll();
    const { a, b } = room(t, 1, quick);
    assert.deepEqual(a.sides(), ['right']);
    assert.deepEqual(b.sides(), ['left']);
  });
  test(`${quick ? 'quick match' : 'room code'}: touch limit applies to both players only with support on both ends`, t => {
    for (const limits of [[threeTouchLimit, undefined], [undefined, threeTouchLimit], [threeTouchLimit, threeTouchLimit]]) {
      const { a, b, finish } = room(t, 0, quick, limits);
      const expected = limits.every(limit => limit === threeTouchLimit) ? threeTouchLimit : undefined;
      for (const player of [a, b]) assert.equal(player.sent.findLast(message => message.type === 'start').state.touchLimit, expected);
      finish();
      a.say({ type: 'restart', round: 1 });
      for (const player of [a, b]) {
        const start = player.sent.findLast(message => message.type === 'start');
        assert.equal(start.round, 2);
        assert.equal(start.state.touchLimit, expected);
      }
      t.mock.restoreAll();
    }
  });
}

test('every rematch swaps ends, and each player then moves the racket on their new side', t => {
  const { a, b, finish, tick } = room(t, 0);
  for (let match = 0; match < 3; match++) {
    finish();
    const round = a.sent.findLast(message => message.type === 'start').round;
    a.say({ type: 'restart', round });
  }
  assert.deepEqual(a.sides(), ['left', 'right', 'left', 'right']);
  assert.deepEqual(b.sides(), ['right', 'left', 'right', 'left']);
  a.say({ type: 'racket', input: { x: 700, y: 300, time: 1 } });
  // Snapshots go out about every 1/60 s, so one 16 ms tick may not send one yet.
  const before = a.sent.length;
  for (let i = 0; i < 5; i++) tick();
  const state = a.sent.slice(before).findLast(message => message.type === 'state').state;
  assert.ok(state.right, 'a now plays on the right');
  assert.equal(state.left ?? undefined, undefined, 'and does not move the left racket');
});
