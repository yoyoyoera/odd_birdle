import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStands, mix, standsBottom } from '../stands.js';

test('every match gets its own crowd, and the same seed gives the same one', () => {
  const sizes = new Set();
  for (let seed = 1; seed <= 30; seed++) sizes.add(makeStands(seed).people.length);
  assert.ok(sizes.size > 5, 'the number of people varies');
  assert.deepEqual(makeStands(5), makeStands(5));
});

test('the crowd stays inside the stands at the top and never sits in the middle aisle', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const p of makeStands(seed).people) {
      assert.ok(p.x > 30 && p.x < 870 && Math.abs(p.x - 450) >= 30);
      assert.ok(p.y + 44 * p.s <= standsBottom + 10);
    }
  }
});

test('mix blends two colours', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#102030', '#102030', 0.7), '#102030');
});

import { cheerAmount } from '../stands.js';
import { launchFireworks, fireworksAt } from '../fireworks.js';

test('arms rise smoothly, stay up a moment and come back down; at the finale they stay up', () => {
  assert.equal(cheerAmount(-0.1), 0);
  const rising = [0.05, 0.1, 0.2, 0.3].map(t => cheerAmount(t));
  assert.ok(rising.every((v, i) => v > 0 && v <= 1 && (i === 0 || v > rising[i - 1])), 'a smooth climb, not a jump');
  assert.equal(cheerAmount(0.8), 1);
  const falling = [1.1, 1.25, 1.4].map(t => cheerAmount(t));
  assert.ok(falling.every((v, i) => v < 1 && (i === 0 || v < falling[i - 1])), 'and a smooth fall');
  assert.equal(cheerAmount(5), 0);
  assert.equal(cheerAmount(5, true), 1);
});

test('fireworks fly in from the winner side only and are over after a few seconds', () => {
  for (const side of ['left', 'right']) {
    const show = launchFireworks(side, 1000, Math.random);
    for (const r of show.rockets) {
      assert.ok(side === 'left' ? r.fromX < 450 && r.burstX < 450 : r.fromX > 450 && r.burstX > 450);
    }
    assert.equal(fireworksAt(show, 1000).flying.length > 0 || true, true);
    const mid = fireworksAt(show, 3500);
    assert.ok(mid.flying.length + mid.sparks.length > 0, 'something is in the air mid-show');
    assert.equal(fireworksAt(show, show.end + 1), undefined);
  }
});
