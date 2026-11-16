import test from 'node:test';
import assert from 'node:assert/strict';
import { barsFor, createLinkQuality } from '../link-quality.js';

test('bars follow ping, lateness and guessed frames: Good needs all three to be low', () => {
  assert.equal(barsFor(30, 10, 0), 3);
  assert.equal(barsFor(100, 10, 0), 2, 'a ping of 100 ms is only fair');
  assert.equal(barsFor(300, 10, 0), 1);
  assert.equal(barsFor(30, 200, 0), 1, 'a good ping with very late packets is still a bad link');
  assert.equal(barsFor(30, 50, 0), 2);
});

test('a Wi-Fi link that felt terrible (ping < 50, lateness 30-80, 3-10 % guessed frames) is not Good', () => {
  assert.equal(barsFor(40, 55, 6), 1);
  assert.equal(barsFor(40, 30, 3), 1);
  assert.equal(barsFor(40, 20, 2), 2, 'a couple of guessed frames per hundred is fair at best');
  assert.equal(barsFor(40, 20, 0.2), 3);
});

test('a bar only comes back when things are clearly better, so the bars do not flicker around a limit', () => {
  assert.equal(barsFor(55, 10, 0, 2), 2, 'just under the limit is not enough to go back to 3');
  assert.equal(barsFor(40, 10, 0, 2), 3);
  assert.equal(barsFor(145, 10, 0, 1), 1);
  assert.equal(barsFor(100, 10, 0, 1), 2);
  assert.equal(barsFor(300, 10, 0, 3), 1, 'getting worse is believed at once');
});

test('measurements are smoothed over a few seconds', () => {
  const link = createLinkQuality();
  assert.equal(link.known, false);
  link.observe(30, 5, 0);
  assert.equal(link.level, 3);
  link.observe(300, 5, 0);
  assert.equal(link.level, 2, 'one bad reading does not drop it all the way');
  for (let i = 0; i < 6; i++) link.observe(300, 5, 0);
  assert.equal(link.level, 1);
  for (let i = 0; i < 14; i++) link.observe(30, 5, 0);
  assert.equal(link.level, 3);
  link.observe(30, 5, 8);
  assert.ok(link.level < 3, 'a burst of guessed frames lowers the bars');
  assert.ok(link.rtt > 25 && link.rtt <= 40);
});
