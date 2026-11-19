import test from 'node:test';
import assert from 'node:assert/strict';
import { lines, verdictFor } from '../card-lines.js';

test('there are enough hand-written lines, none empty or repeated', () => {
  const all = Object.values(lines).flat();
  assert.ok(all.length >= 85, `only ${all.length} lines`);
  assert.equal(new Set(all).size, all.length, 'a line appears twice');
  assert.ok(all.every(line => line.length > 8 && line.length < 60), 'every line fits on the card');
});

test('the line follows what happened', () => {
  assert.ok(lines.shutoutWin.includes(verdictFor({ won: true, mine: 7, theirs: 0 }, 3)));
  assert.ok(lines.closeWin.includes(verdictFor({ won: true, mine: 7, theirs: 6 }, 3)));
  assert.ok(lines.comebackWin.includes(verdictFor({ won: true, mine: 7, theirs: 4, comeback: true }, 3)));
  assert.ok(lines.dominantWin.includes(verdictFor({ won: true, mine: 9, theirs: 3 }, 3)));
  const lostNothing = new Set(Array.from({ length: 40 }, (_, seed) => verdictFor({ won: false, mine: 0, theirs: 5 }, seed)));
  assert.ok(lines.shutoutLoss.every(line => lostNothing.has(line)), 'every shutout line shows up');
});

test('after a loss the teasing lines are in the mix, after a win never', () => {
  const lost = new Set(Array.from({ length: 60 }, (_, seed) => verdictFor({ won: false, mine: 3, theirs: 5 }, seed)));
  assert.ok(lines.lostAndCarded.some(line => lost.has(line)));
  const won = new Set(Array.from({ length: 60 }, (_, seed) => verdictFor({ won: true, mine: 7, theirs: 5 }, seed)));
  assert.ok(lines.lostAndCarded.every(line => !won.has(line)));
});

test('the same match and seed always give the same line', () => {
  const stats = { won: false, mine: 2, theirs: 5, effectKinds: 2 };
  assert.equal(verdictFor(stats, 9), verdictFor(stats, 9));
});
