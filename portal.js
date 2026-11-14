// Where the game is running: our site (''), or a portal build ('crazygames', 'itch', 'newgrounds')
// marked on <html data-portal> by scripts/build-portal.mjs ('gamepix' too).
export const portal = document.documentElement.dataset.portal ?? '';
export const siteUrl = 'https://oddbirdle.pages.dev/';
// Portal builds are served from the portal's domain but play on our server.
export const serverBase = portal ? siteUrl : new URL('./', location.href).href;

let sdk;
let playing = false;

// GamePix SDK v3 (portal 'gamepix'): pause/resume are required, the loading signals and the ads are optional.
let gamepix;
let paused = false;
let started = false;
let ready = false;
let matchesSinceAd = 0;
let lastAd = -Infinity;
const pauseListeners = [];
const muteListeners = [];
const adGapMs = 3 * 60 * 1000;
const adEveryMatches = 3;

function setPaused(next) {
  if (next === paused) return;
  paused = next;
  for (const listener of pauseListeners) listener(paused);
  for (const listener of muteListeners) listener(paused);
}

export const isPaused = () => paused;
export function onPortalPause(handler) {
  pauseListeners.push(handler);
}

function initGamepix() {
  const candidate = window.GamePix;
  if (!candidate?.events) return;
  gamepix = candidate;
  candidate.events.on('pause', () => setPaused(true));
  candidate.events.on('resume', () => setPaused(false));
}

function gamepixCall(action) {
  try {
    if (gamepix) return action(gamepix);
  } catch {
    // The portal must never break the game.
  }
  return undefined;
}

// A match has ended: GamePix likes to hear whether it went well, and ads are counted in finished matches.
export function matchEnded(won) {
  matchesSinceAd++;
  if (ready) gamepixCall(g => won ? g.happyMoment('match_won') : g.sadMoment('match_lost'));
}

// Called before a new match begins. After a few finished matches, and not more than every few minutes, the
// portal's ad runs here, between matches and never during one. Resolves when it is over (or at once if none).
export async function matchBreak() {
  if (!gamepix || !ready || paused || matchesSinceAd < adEveryMatches || Date.now() - lastAd < adGapMs) return;
  matchesSinceAd = 0;
  lastAd = Date.now();
  try {
    await gamepix.ads.interstitial();
  } catch {
    // No ad is fine.
  }
}

// CrazyGames SDK v3. Every call throws outside CrazyGames, so only use it there.
export async function initPortal() {
  if (portal === 'gamepix') {
    initGamepix();
    return;
  }
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

export function loadingStart() {
  call(game => game.loadingStart());
  gamepixCall(g => g.lifecycle.loading(10));
}

export async function loadingStop() {
  call(game => game.loadingStop());
  if (!gamepix) return;
  gamepixCall(g => g.lifecycle.loading(100));
  try {
    await gamepix.lifecycle.loaded();
  } catch {
    // Carry on without it.
  }
  ready = true;
  document.querySelector('#gamepix-loading')?.remove();
}

// Tells CrazyGames when a match is being played (start, rematch) and when it is not (menus, results).
export function setPlaying(active) {
  if (active === playing) return;
  playing = active;
  if (active && !started) {
    started = true;
    gamepixCall(g => g.lifecycle.gameStart());
  }
  call(game => active ? game.gameplayStart() : game.gameplayStop());
}

// Invite links that stay on the portal; undefined when the SDK is not available.
export function portalInviteLink(code) {
  // GamePix: no links out of the game, so the invite is the room code itself.
  if (portal === 'gamepix') return code;
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
  if (portal === 'gamepix') return paused;
  let muted = false;
  call(game => { muted = game.settings?.muteAudio === true; });
  return muted;
}

export function onPortalMute(handler) {
  muteListeners.push(handler);
  call(game => game.addSettingsChangeListener(settings => handler(settings?.muteAudio === true)));
}

export function portalInviteRoom() {
  let room;
  call(game => { room = game.getInviteParam('room'); });
  return room ?? undefined;
}
