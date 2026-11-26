import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, outlineOf, shelfFor, racketById, starterOwned, plainRadius } from '../rackets.js';
import { createGame, step } from '../game.js';

// Area of the union of circles, by counting grid points.
function area(parts) {
  let inside = 0;
  for (let x = -40; x <= 40; x += 0.5) for (let y = -40; y <= 40; y += 0.5) {
    if (parts.some(part => (x - part.x) ** 2 + (y - part.y) ** 2 <= part.r * part.r)) inside++;
  }
  return inside * 0.25;
}

test('every racket covers about the area of the plain one', () => {
  const plain = Math.PI * plainRadius * plainRadius;
  for (const racket of catalog) {
    const ratio = area(racket.parts) / plain;
    assert.ok(ratio > 0.9 && ratio < 1.1, `${racket.id} covers ${(ratio * 100).toFixed(0)}% of the plain racket`);
  }
});

test('the drawn outline wraps the circles it is made of', () => {
  for (const racket of catalog) {
    const outline = outlineOf(racket.parts);
    assert.equal(outline.length, 72);
    for (const point of outline) {
      assert.ok(racket.parts.some(part => Math.hypot(point.x - part.x, point.y - part.y) <= part.r + 0.01), racket.id + ' outline is on the shape');
    }
    assert.ok(Math.max(...outline.map(point => Math.abs(point.x))) <= racket.halfX + 0.01);
  }
});

test('the shelf is three rackets for sale, the same for everyone on one day and different over days', () => {
  const a = shelfFor('2026-11-26');
  assert.equal(a.length, 3);
  assert.ok(a.every(racket => racket.price > 0));
  assert.deepEqual(a.map(racket => racket.id), shelfFor('2026-11-26').map(racket => racket.id));
  const days = new Set(Array.from({ length: 10 }, (_, i) => shelfFor('2026-12-' + String(i + 1).padStart(2, '0')).map(racket => racket.id).join()));
  assert.ok(days.size > 1);
  assert.ok(starterOwned.every(id => racketById(id)));
});

function live(shape) {
  const game = createGame({ twoPlayers: true });
  game.setShuttle({ shape: 0, size: 1 }); // the same shuttle every time, so the reach is the same number every time
  game.restart(0, undefined, null, { touchLimit: 3 });
  for (let i = 0; i < 400 && game.view().phase !== 'live'; i++) game.simulate(step);
  if (shape) game.setRacketShape('left', shape);
  return game;
}

// Does a racket standing still hit a shuttle that is `offset` above its centre?
function reaches(shape, offset) {
  const game = live(shape);
  game.moveRacket('left', { x: 200, y: 300, time: 0 });
  game.testShot({ x: 200, y: 300 - offset, vx: 0, vy: 0, hitter: 'right' });
  const flight = game.view().shuttle.flight;
  for (let i = 0; i < 3; i++) { game.moveRacket('left', { x: 200, y: 300, time: (i + 1) * 8 }); game.simulate(step); }
  return game.view().shuttle.flight > flight;
}

test('a long racket hits a shuttle above its centre that the plain racket cannot reach', () => {
  const longRacket = racketById('long');
  // This shuttle is touched by the plain racket up to 38 above its centre, by the long one up to 46, and by neither at 50.
  assert.equal(reaches(undefined, 30), true);
  assert.equal(reaches(longRacket, 30), true);
  for (const offset of [42, 46]) {
    assert.equal(reaches(undefined, offset), false, 'plain, ' + offset);
    assert.equal(reaches(longRacket, offset), true, 'long, ' + offset);
  }
  assert.equal(reaches(longRacket, 54), false, 'but not forever');
});

test('a wide racket reaches sideways, and a shaped racket stays inside its half of the court', () => {
  const wide = racketById('wide');
  const game = live(wide);
  game.moveRacket('left', { x: 9999, y: 300, time: 0 });
  assert.equal(game.view().left.x, 450 - wide.halfX, 'the edge of the shape stops at the net');
  assert.ok(game.view().left.parts, 'the view carries the shape for drawing');
});
