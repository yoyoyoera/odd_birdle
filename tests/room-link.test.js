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

import { inviteUrl, roomFromInvite } from '../room-link.js';

test('the invite link the app shares is /join/CODE on the site, and the app reads it back (or the older ?room= form)', () => {
  const link = inviteUrl('ABC123', 'https://example.test/');
  assert.equal(link, 'https://example.test/join/ABC123');
  assert.equal(roomFromInvite(link), 'ABC123');
  assert.equal(roomFromInvite('https://example.test/join/abc123/'), 'ABC123');
  assert.equal(roomFromInvite('https://example.test/?room=XYZ789'), 'XYZ789');
  assert.equal(roomFromInvite('https://example.test/join/TOOLONG1'), undefined);
  assert.equal(roomFromInvite('https://example.test/privacy'), undefined);
  assert.equal(roomFromInvite('not a link'), undefined);
  assert.equal(roomFromInvite(undefined), undefined);
});
