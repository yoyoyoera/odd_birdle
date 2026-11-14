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
import { launchConfetti, confettiAt } from '../confetti.js';

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

test('confetti drifts down over the winner side only and is gone after a few seconds', () => {
  for (const side of ['left', 'right']) {
    const show = launchConfetti(side, 1000);
    for (const p of show.pieces) {
      assert.ok(side === 'left' ? p.x + p.sway < 470 : p.x - p.sway > 430, 'stays over that half');
    }
    const early = confettiAt(show, 1500);
    const later = confettiAt(show, 3500);
    assert.ok(early.length > 0 && later.length > 0, 'pieces in the air');
    assert.ok(later.every(p => p.y > -12 && p.y < 512 && p.width > 0 && p.width <= 1));
    assert.equal(confettiAt(show, show.end + 1), undefined);
  }
});

import { shockFlicker, shockJolt } from '../juice.js';

test('SHOCK blinks dark first, then bright, then settles; the crowd flinches and recovers', () => {
  const at = e => shockFlicker(0.55 - e);
  assert.deepEqual(shockFlicker(0.55), { dark: 0, light: 0 });
  assert.ok(at(0.1).dark > 0.3 && at(0.1).light === 0, 'dark first');
  assert.ok(at(0.3).light > 0.2 && at(0.3).dark === 0, 'then bright');
  assert.ok(at(0.5).light < at(0.34).light, 'and it fades');
  assert.deepEqual(shockFlicker(0), { dark: 0, light: 0 });
  assert.ok(shockJolt(0.55 - 0.08) === 1 && shockJolt(0.2) < 1 && shockJolt(0.55) === 0);
});
