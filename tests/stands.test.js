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
