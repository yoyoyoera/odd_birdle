import test from 'node:test';
import assert from 'node:assert/strict';
import { barsFor, createLinkQuality } from '../link-quality.js';

test('bars follow the round trip and lateness: 3 under 80 ms, 2 up to 180, 1 beyond or when packets run very late', () => {
  assert.equal(barsFor(40, 10), 3);
  assert.equal(barsFor(120, 10), 2);
  assert.equal(barsFor(300, 10), 1);
  assert.equal(barsFor(40, 200), 1, 'a good ping with very late packets is still a bad link');
  assert.equal(barsFor(40, 100), 2);
});

test('a bar only comes back when things are clearly better, so the bars do not flicker around a limit', () => {
  assert.equal(barsFor(70, 10, 2), 2, 'just under 80 is not enough to go back to 3');
  assert.equal(barsFor(60, 10, 2), 3);
  assert.equal(barsFor(170, 10, 1), 1);
  assert.equal(barsFor(140, 10, 1), 2);
  assert.equal(barsFor(300, 10, 3), 1, 'getting worse is believed at once');
});

test('measurements are smoothed over a few seconds', () => {
  const link = createLinkQuality();
  assert.equal(link.known, false);
  link.observe(40, 10, 0);
  assert.equal(link.level, 3);
  link.observe(300, 10, 2000);
  assert.equal(link.level, 2, 'one bad reading does not make it one bar');
  for (let t = 4000; t <= 12000; t += 2000) link.observe(300, 10, t);
  assert.equal(link.level, 1);
  assert.ok(link.rtt > 250 && link.rtt <= 300, "the shown round trip is the smoothed one");
});
