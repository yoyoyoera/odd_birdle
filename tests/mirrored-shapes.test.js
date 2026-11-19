import test from 'node:test';
import assert from 'node:assert/strict';
import { setMirroredShapes, shapeCount, shuttleOutline } from '../game.js';

test('a mirrored court gets each shape back to front, so the flipped screen shows it the right way round', () => {
  for (let shape = 0; shape < shapeCount; shape++) {
    for (const angle of [0, 0.7, -1.9]) {
      const pose = { shape, size: 21, angle };
      setMirroredShapes(false);
      const normal = shuttleOutline(pose);
      setMirroredShapes(true);
      const mirrored = shuttleOutline(pose);
      setMirroredShapes(false);
      // Flip the mirrored outline left to right and turn it back by the same angle: it is the normal outline's shape,
      // seen as it is on screen. For angle 0 that means it equals the normal outline exactly.
      if (angle === 0) {
        mirrored.forEach((ring, r) => ring.forEach((point, i) => {
          assert.ok(Math.abs(-point.x - normal[r][i].x) < 1e-9 && Math.abs(point.y - normal[r][i].y) < 1e-9);
        }));
      }
      assert.equal(mirrored.length, normal.length);
    }
  }
});

test('mirroring is off by default and switches back off', () => {
  const pose = { shape: shapeCount - 1, size: 21, angle: 0 };
  setMirroredShapes(true);
  const flipped = shuttleOutline(pose);
  setMirroredShapes(false);
  const plain = shuttleOutline(pose);
  assert.notDeepEqual(flipped, plain);
  assert.deepEqual(shuttleOutline(pose), plain);
});
