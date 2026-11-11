import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoomCode, roomFromLink, roomLink } from '../room-link.js';

test('invite links carry the room code on the page URL', () => {
  assert.equal(roomLink('AB12CD', 'https://oddbirdle.pages.dev/'), 'https://oddbirdle.pages.dev/?room=AB12CD');
  assert.equal(roomLink('AB12CD', 'https://oddbirdle.pages.dev/index.html?room=OLD123#x'),
    'https://oddbirdle.pages.dev/?room=AB12CD');
});

test('room codes are read back from invite links', () => {
  assert.equal(roomFromLink('https://oddbirdle.pages.dev/?room=ab12cd'), 'AB12CD');
  assert.equal(roomFromLink('https://oddbirdle.pages.dev/?room=bad'), undefined);
  assert.equal(roomFromLink('https://oddbirdle.pages.dev/'), undefined);
  assert.equal(normalizeRoomCode(' xy9z01 '), 'XY9Z01');
});
