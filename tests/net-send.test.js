import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacketSender } from '../net-send.js';

function harness(interval) {
  let clock = 0;
  const sent = [];
  const waiting = [];
  const sender = createRacketSender(message => sent.push(message), {
    interval: () => interval, now: () => clock,
    later: (fn, ms) => { const entry = { fn, at: clock + ms }; waiting.push(entry); return entry; },
    cancel: entry => { waiting.splice(waiting.indexOf(entry), 1); }
  });
  const advance = ms => {
    clock += ms;
    for (const entry of waiting.filter(item => item.at <= clock)) {
      waiting.splice(waiting.indexOf(entry), 1);
      entry.fn();
    }
  };
  return { sender, sent, advance };
}
const move = x => ({ type: 'racket', input: { x, y: 0, time: 0 }, seenTime: 0 });

test('a mouse (no interval) sends every move straight away', () => {
  const { sender, sent } = harness(0);
  for (let x = 0; x < 5; x++) sender.push(move(x));
  assert.equal(sent.length, 5);
});

test('touch moves are bundled: one per interval, the newest position', () => {
  const { sender, sent, advance } = harness(33);
  sender.push(move(1)); // first goes out at once
  advance(8); sender.push(move(2));
  advance(8); sender.push(move(3));
  advance(8); sender.push(move(4));
  assert.deepEqual(sent.map(m => m.input.x), [1]);
  advance(10); // 34ms since the first send
  assert.deepEqual(sent.map(m => m.input.x), [1, 4]);
  advance(100);
  assert.equal(sent.length, 2, 'nothing more to send');
});

test('lifting the finger goes out at once and drops what was waiting', () => {
  const { sender, sent, advance } = harness(33);
  sender.push(move(1));
  advance(5); sender.push(move(2));
  sender.push({ type: 'racket', input: null, seenTime: 0 });
  assert.deepEqual(sent.map(m => m.input?.x ?? null), [1, null]);
  advance(100);
  assert.equal(sent.length, 2, 'the stale move is never sent after the lift');
});

test('a steady stream goes out at about the interval', () => {
  const { sender, sent, advance } = harness(33);
  // A move every 8ms for 800ms, time passing 1ms at a time.
  for (let ms = 0; ms < 800; ms++) { if (ms % 8 === 0) sender.push(move(ms / 8)); advance(1); }
  advance(40);
  assert.ok(sent.length >= 22 && sent.length <= 28, `sent ${sent.length} for 800ms`);
  assert.equal(sent.at(-1).input.x, 99, 'the final position always arrives');
});
