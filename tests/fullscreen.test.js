import test from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenElement, fullscreenSupported, toggleFullscreen } from '../fullscreen.js';

const fakeDoc = (extra = {}) => {
  const doc = {
    fullscreenEnabled: true, fullscreenElement: null,
    documentElement: { requestFullscreen() {} },
    async exitFullscreen() { doc.fullscreenElement = null; },
    ...extra
  };
  return doc;
};

test('full screen is offered only when the browser can do it', () => {
  assert.equal(fullscreenSupported(fakeDoc()), true);
  assert.equal(fullscreenSupported(fakeDoc({ fullscreenEnabled: false })), false);
  assert.equal(fullscreenSupported(fakeDoc({ documentElement: {} })), false, 'iPhone Safari: no API at all');
  assert.equal(fullscreenSupported({ webkitFullscreenEnabled: true, documentElement: { webkitRequestFullscreen() {} } }), true, 'prefixed Safari');
});

test('the button enters full screen with the element, and leaves it the second time', async () => {
  const doc = fakeDoc();
  const main = { async requestFullscreen() { doc.fullscreenElement = main; } };
  assert.equal(await toggleFullscreen(main, doc), true);
  assert.equal(fullscreenElement(doc), main);
  assert.equal(await toggleFullscreen(main, doc), false);
  assert.equal(fullscreenElement(doc), null);
});

test('a refused request leaves the page as it was and does not throw', async () => {
  const doc = fakeDoc();
  const main = { async requestFullscreen() { throw new Error('denied'); } };
  assert.equal(await toggleFullscreen(main, doc), false);
});

test('the prefixed Safari names work too', async () => {
  const doc = { webkitFullscreenElement: null, async webkitExitFullscreen() { doc.webkitFullscreenElement = null; } };
  const main = { async webkitRequestFullscreen() { doc.webkitFullscreenElement = main; } };
  assert.equal(await toggleFullscreen(main, doc), true);
  assert.equal(await toggleFullscreen(main, doc), false);
});
