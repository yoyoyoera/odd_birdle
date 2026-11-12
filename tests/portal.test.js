import test from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the CrazyGames SDK v3 that records what the game asks of it.
const calls = [];
const listeners = {};
globalThis.location = new URL('https://games.crazygames.com/oddbirdle/index.html');
globalThis.document = { documentElement: { dataset: { portal: 'crazygames' } } };
globalThis.window = { CrazyGames: { SDK: {
  environment: 'crazygames',
  async init() { calls.push('init'); },
  game: {
    isInstantMultiplayer: true,
    settings: { muteAudio: true },
    updateRoom: room => calls.push(['updateRoom', room]),
    leftRoom: () => calls.push('leftRoom'),
    addJoinRoomListener: listener => { listeners.join = listener; },
    addSettingsChangeListener: listener => { listeners.settings = listener; },
    gameplayStart: () => calls.push('gameplayStart'),
    gameplayStop: () => calls.push('gameplayStop'),
    getInviteParam: () => null,
    inviteLink: params => 'https://www.crazygames.com/game/oddbirdle?room=' + params.room
  }
} } };
const portal = await import('../portal.js');

test('CrazyGames instant multiplayer, room data, join and mute', async () => {
  await portal.initPortal();
  assert.equal(portal.serverBase, 'https://oddbirdle.pages.dev/');
  assert.equal(portal.isInstantMultiplayer(), true);
  assert.equal(portal.portalMuted(), true);

  portal.roomLeft();
  assert.ok(!calls.includes('leftRoom'), 'no leftRoom before joining one');
  portal.roomOpen('AB12CD');
  portal.roomFull('AB12CD');
  portal.roomLeft();
  portal.roomLeft();
  assert.deepEqual(calls.slice(1), [
    ['updateRoom', { roomId: 'AB12CD', isJoinable: true, inviteParams: { room: 'AB12CD' } }],
    ['updateRoom', { roomId: 'AB12CD', isJoinable: false }],
    'leftRoom'
  ]);

  const joined = [];
  portal.onJoinRoom(code => joined.push(code));
  listeners.join({ room: 'ZZ9ZZ9' });
  assert.deepEqual(joined, ['ZZ9ZZ9']);

  const muted = [];
  portal.onPortalMute(value => muted.push(value));
  listeners.settings({ muteAudio: false, disableChat: false });
  listeners.settings({ muteAudio: true });
  assert.deepEqual(muted, [false, true]);

  assert.equal(portal.portalInviteLink('AB12CD'), 'https://www.crazygames.com/game/oddbirdle?room=AB12CD');
});
