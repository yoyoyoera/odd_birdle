import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuoTouch } from '../duo-touch.js';

const make = (extra = {}) => createDuoTouch({ screenWidth: () => 800, scale: () => 2, center: 450, width: 900, floor: 480, racketRadius: 30, ...extra });

test('the screen is split into two equal halves, each moving its own racket', () => {
  const duo = make();
  assert.equal(duo.down(1, 100, 200).side, 'left');
  assert.equal(duo.down(2, 700, 200).side, 'right');
  assert.equal(duo.down(3, 399, 10), undefined, 'a second finger in the left half is ignored');
  const left = duo.move(1, 110, 200);
  assert.equal(left.side, 'left');
  assert.equal(left.racket.x, 225 + 20, 'moves by the finger distance times the speed');
  const right = duo.move(2, 690, 210);
  assert.equal(right.side, 'right');
  assert.equal(right.racket.x, 675 - 20);
  assert.equal(right.racket.y, 280 + 20);
});

test('a racket stays in its own half and on the court', () => {
  const duo = make();
  duo.down(1, 100, 200);
  assert.equal(duo.move(1, 900, 200).racket.x, 420, 'not past the net');
  assert.equal(duo.move(1, -900, 200).racket.x, 0);
  assert.equal(duo.move(1, -900, 5000).racket.y, 480);
  duo.down(2, 700, 200);
  assert.equal(duo.move(2, -5000, 200).racket.x, 480, 'the right racket does not cross the net either');
  assert.equal(duo.move(2, 8000, 200).racket.x, 900);
});

test('a racket keeps its place between touches, and the halves are free again after a finger lifts', () => {
  const duo = make();
  duo.down(1, 100, 200);
  duo.move(1, 150, 200);
  assert.equal(duo.up(1), true);
  const again = duo.down(5, 50, 400);
  assert.equal(again.side, 'left');
  assert.equal(again.racket.x, 225 + 100, 'the racket stayed where it was');
  duo.reset();
  assert.equal(duo.down(9, 10, 10).racket.x, 225);
});
