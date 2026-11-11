import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../demo.js';
import { center, step } from '../game.js';

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

test('title demo rallies on both sides and keeps serving new birds', t => {
  t.mock.method(Math, 'random', seeded(7));
  const demo = createDemo(seeded(11));
  const hits = { left: 0, right: 0 };
  const shapes = new Set();
  let lastFlash = 0;
  let points = 0;
  let lastScore = '0:0';
  for (let time = 0; time < 120; time += step) {
    demo.advance(step);
    const view = demo.view();
    assert.equal(view.eventText, '');
    assert.equal(view.shake, 0);
    if (view.shuttle) {
      shapes.add(view.shuttle.shape);
      if (view.flash > lastFlash + 0.1) hits[view.shuttle.x < center ? 'left' : 'right']++;
    }
    lastFlash = view.flash;
    const score = view.score.left + ':' + view.score.right;
    if (score !== lastScore && score !== '0:0') points++;
    lastScore = score;
  }
  assert.ok(hits.left >= 20, `left returned ${hits.left} times`);
  assert.ok(hits.right >= 20, `right returned ${hits.right} times`);
  assert.ok(points >= 4, `only ${points} points in two minutes`);
  assert.ok(shapes.size >= 4, `only ${shapes.size} bird shapes shown`);
});
