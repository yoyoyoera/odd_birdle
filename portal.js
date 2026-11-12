// Where the game is running: our site (''), or a portal build ('crazygames', 'itch')
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

export function portalInviteRoom() {
  let room;
  call(game => { room = game.getInviteParam('room'); });
  return room ?? undefined;
}
