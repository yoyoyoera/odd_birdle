// Where the game is running: our site (''), or a portal build ('crazygames', 'itch', 'newgrounds')
// marked on <html data-portal> by scripts/build-portal.mjs.
export const portal = document.documentElement.dataset.portal ?? '';
export const siteUrl = 'https://oddbirdle.pages.dev/';
// Portal builds are served from the portal's domain but play on our server.
export const serverBase = portal ? siteUrl : new URL('./', location.href).href;

let sdk;
let playing = false;

// CrazyGames SDK v3. Every call throws outside CrazyGames, so only use it there.
export async function initPortal() {
  const candidate = portal === 'crazygames' ? window.CrazyGames?.SDK : undefined;
  if (!candidate) return;
  try {
    await candidate.init();
    if (candidate.environment === 'crazygames' || candidate.environment === 'local') sdk = candidate;
  } catch {
    sdk = undefined;
  }
}

function call(action) {
  try {
    if (sdk) action(sdk.game);
  } catch {
    // The portal must never break the game.
  }
}

export const loadingStart = () => call(game => game.loadingStart());
export const loadingStop = () => call(game => game.loadingStop());

// Tells CrazyGames when a match is being played (start, rematch) and when it is not (menus, results).
export function setPlaying(active) {
  if (active === playing) return;
  playing = active;
  call(game => active ? game.gameplayStart() : game.gameplayStop());
}

// Invite links that stay on the portal; undefined when the SDK is not available.
export function portalInviteLink(code) {
  let link;
  call(game => { link = game.inviteLink({ room: code }); });
  return link;
}

// CrazyGames multiplayer: party leaders who arrive with this flag go straight to a new room.
export function isInstantMultiplayer() {
  let instant = false;
  call(game => { instant = game.isInstantMultiplayer === true; });
  return instant;
}

// Room Data drives the CrazyGames invite button: open while waiting, closed once full.
let inRoom = false;
export function roomOpen(code) {
  inRoom = true;
  call(game => game.updateRoom({ roomId: code, isJoinable: true, inviteParams: { room: code } }));
}

export function roomFull(code) {
  inRoom = true;
  call(game => game.updateRoom({ roomId: code, isJoinable: false }));
}

export function roomLeft() {
  if (!inRoom) return;
  inRoom = false;
  call(game => game.leftRoom());
}

// Someone already playing accepted an invite.
export function onJoinRoom(handler) {
  call(game => game.addJoinRoomListener(params => handler(params?.room)));
}

// CrazyGames can mute the game; that wins over the in-game sound button.
export function portalMuted() {
  let muted = false;
  call(game => { muted = game.settings?.muteAudio === true; });
  return muted;
}

export function onPortalMute(handler) {
  call(game => game.addSettingsChangeListener(settings => handler(settings?.muteAudio === true)));
}

export function portalInviteRoom() {
  let room;
  call(game => { room = game.getInviteParam('room'); });
  return room ?? undefined;
}
