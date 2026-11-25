import test from 'node:test';
import assert from 'node:assert/strict';
import { landscapeOnly, touchLayout } from '../touch-layout.js';

const phone = (width, height, mode, more = {}) => touchLayout({ coarse: true, width, height, mode, ...more });

test('website and portals: an upright phone gets the thumb pad and stacked menu, on its side the whole-screen pad', () => {
  assert.deepEqual(phone(390, 844, 'menu'), { upright: true, landscape: false, view: 'menu', sideGuide: false });
  assert.deepEqual(phone(390, 844, 'solo'), { upright: true, landscape: false, view: 'play', sideGuide: false });
  assert.deepEqual(phone(390, 844, 'online'), { upright: true, landscape: false, view: 'play', sideGuide: false });
  assert.equal(phone(390, 844, 'waiting').view, '');
  assert.deepEqual(phone(844, 390, 'solo'), { upright: false, landscape: true, view: '', sideGuide: true });
  // Nearly square: not upright, not wide either (as before).
  assert.deepEqual(phone(500, 510, 'solo'), { upright: false, landscape: false, view: '', sideGuide: true });
  // A mouse: none of it.
  assert.deepEqual(touchLayout({ coarse: false, width: 390, height: 844, mode: 'solo' }),
    { upright: false, landscape: false, view: '', sideGuide: false });
});

test('the app is landscape only: sideways layout and guide even in a window taller than wide', () => {
  for (const [width, height] of [[844, 390], [600, 900], [390, 844]]) {
    for (const mode of ['menu', 'solo', 'online']) {
      assert.deepEqual(phone(width, height, mode, { landscapeOnly: true }),
        { upright: false, landscape: true, view: '', sideGuide: true }, `${width}x${height} ${mode}`);
    }
  }
});

test('only <html data-orientation="landscape"> locks it', () => {
  assert.equal(landscapeOnly({ orientation: 'landscape', portal: 'app' }), true);
  assert.equal(landscapeOnly({ portal: 'app' }), false);
  assert.equal(landscapeOnly({ portal: 'itch' }), false);
  assert.equal(landscapeOnly({}), false);
  assert.equal(landscapeOnly(undefined), false);
});
