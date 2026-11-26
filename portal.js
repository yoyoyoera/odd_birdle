// Where the game is running: our site (''), or a portal build ('crazygames', 'itch', 'newgrounds')
// marked on <html data-portal> by scripts/build-portal.mjs ('gamepix' and 'y8' too, and 'app' for the Android app).
import { createGdAds, showGdContinue } from './gd-ads.js';

export const portal = document.documentElement.dataset.portal ?? '';
export const siteUrl = 'https://oddbirdle.pages.dev/';

// The Reddit name of whoever is playing inside Reddit (empty anywhere else, or if Reddit does not say). Reddit's
// client library is only loaded in the Reddit build, where the build tooling bundles it.
let redditUser = '';
// Reddit's app scrolls the feed when a thumb drags up or down inside an inline post, so on a phone the game opens in
// Reddit's full-screen ("expanded") view, where the drags belong to the game. These tell the page which view it is in.
let redditClient;
const viewListeners = [];
const redditIdentityReady = portal === 'reddit'
  ? import('@devvit/web/client').then(module => {
    redditClient = module;
    redditUser = module.context.username ?? '';
    module.addWebViewModeListener?.(() => viewListeners.forEach(listener => listener()));
    viewListeners.forEach(listener => listener());
    return module.context.userId ?? '';
  }).catch(() => '')
  : Promise.resolve('');
export const redditViewMode = () => redditClient?.getWebViewMode?.() ?? 'expanded';
export const onRedditViewMode = listener => { viewListeners.push(listener); };
export const expandRedditView = event => redditClient?.requestExpandedMode?.(event, 'game');
export const exitRedditExpanded = event => redditClient?.exitExpandedMode?.(event);
export const redditIdentity = () => redditIdentityReady;
export const redditName = () => redditUser;
// Whether this build can post a card to Reddit.
export const canPostCard = portal === 'reddit';
// Portals that allow no links out of the game and no analytics of our own: invites are the room code, nothing is
// counted, and the debug and test pages are off. The apps are the same: everything they need is inside them.
export const closedPortal = ['gamepix', 'y8', 'gamedistribution', 'app', 'reddit'].includes(portal);
export const coordinatedBreak = ['gamepix', 'gamedistribution'].includes(portal);
// Portal builds are served from the portal's domain but play on our server.
export const serverBase = portal ? siteUrl : new URL('./', location.href).href;

let sdk;
let gd;
let gdPrerollRequested = false;
let playing = false;

// GamePix SDK v3 (portal 'gamepix'): pause/resume are required, the loading signals and the ads are optional.
let gamepix;
let paused = false;
let started = false;
let ready = false;
let matchesSinceAd = 0;
let lastAd = -Infinity;
let sdkPaused = false;
let focusPaused = false;
let adPaused = false;
let appPaused = false;
let sdkMuted = false;
let muted = false;
const pauseListeners = [];
const muteListeners = [];
const adGapMs = 3 * 60 * 1000;
const adEveryMatches = 3;
const gdAdGapMs = 2 * 60 * 1000;
// The longest a Y8 ad may keep the game paused when the SDK never says it is over.
export const y8AdLimitMs = 90 * 1000;
// How long a Y8 break may take to start before the game goes on without it.
export const y8AdStartMs = 3000;

function refreshPause() {
  const next = sdkPaused || focusPaused || adPaused || appPaused;
  if (next !== paused) {
    paused = next;
    for (const listener of pauseListeners) listener(paused);
  }
  refreshMute();
}

function refreshMute() {
  const next = paused || sdkMuted;
  if (next === muted) return;
  muted = next;
  for (const listener of muteListeners) listener(muted);
}

export const isPaused = () => paused;
// The Android app (app-shell.js): the back button's pause screen, and the app being in the background.
export function setAppPaused(value) {
  appPaused = Boolean(value);
  refreshPause();
}
export function onPortalPause(handler) {
  pauseListeners.push(handler);
}

function initGamepix() {
  const candidate = window.GamePix;
  if (candidate?.events) {
    gamepix = candidate;
    candidate.events.on('pause', () => { sdkPaused = true; refreshPause(); });
    candidate.events.on('resume', () => { sdkPaused = false; refreshPause(); });
    // The Player still invokes these legacy callbacks for its sound controls,
    // separately from pause/resume. Keep the player's mute until soundOn arrives.
    candidate.soundOff = () => { sdkMuted = true; refreshMute(); };
    candidate.soundOn = () => { sdkMuted = false; refreshMute(); };
  }
  // GamePix requires visibility pausing, not blur pausing when the iframe loses focus.
  const visibility = () => { focusPaused = !!document.hidden; refreshPause(); };
  document.addEventListener('visibilitychange', visibility);
  visibility();
  const stage = document.querySelector('#stage');
  if (stage) stage.inert = true;
}

// Y8: the game pauses and goes quiet when the tab is hidden or the window loses focus (a click outside the frame
// counts), and while one of its ads is on. The SDK itself is started by the page (see build-portal.mjs).
function initY8() {
  const lose = () => { focusPaused = true; refreshPause(); };
  const regain = () => { if (!document.hidden) { focusPaused = false; refreshPause(); } };
  window.addEventListener('blur', lose);
  window.addEventListener('focus', regain);
  document.addEventListener('visibilitychange', () => (document.hidden ? lose() : regain()));
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
export async function matchBreak({ rematch = false } = {}) {
  if (portal === 'gamedistribution') {
    if (!gd || paused || typeof window.gdsdk?.showAd !== 'function') return;
    // One initial request per page visit. Subsequent requests are allowed only on
    // a finished match's Replay click, at least two minutes after the last request.
    // Merely switching modes or making/joining another room must not request ads.
    if (gdPrerollRequested && (!rematch || Date.now() - lastAd < gdAdGapMs)) return;
    gdPrerollRequested = true;
    lastAd = Date.now();
    return gd.request();
  }
  if (portal === 'y8') return y8Break();
  if (!gamepix || !ready || paused || matchesSinceAd < adEveryMatches || Date.now() - lastAd < adGapMs) return;
  matchesSinceAd = 0;
  lastAd = Date.now();
  await gamepixBreak();
}

// GamePix's interstitial: the next match waits for it, but never for good. The SDK pauses the game itself while an ad
// is on (sdkPaused), so letting the match go ahead early never plays under an ad. Goes on when the ad's Promise settles;
// when an ad that had paused the game hands it back; when nothing has started after gamepixAdStartMs (an SDK that never
// answers would otherwise leave PLAY AGAIN dead, the way Y8 saw it); and after gamepixAdLimitMs whatever happens.
export const gamepixLoadedMs = 10000;
export const gamepixAdStartMs = 5000;
export const gamepixAdLimitMs = 120000;
function gamepixBreak() {
  return new Promise(resolve => {
    let waited = 0;
    let started = false;
    const finish = () => {
      clearInterval(watch);
      resolve();
    };
    const watch = setInterval(() => {
      waited += 250;
      if (sdkPaused) started = true;
      else if (started || waited >= gamepixAdStartMs) finish();
      if (waited >= gamepixAdLimitMs) finish();
    }, 250);
    try {
      Promise.resolve(gamepix.ads.interstitial()).then(finish, finish);
    } catch {
      // No ad is fine.
      finish();
    }
  });
}

// Y8: an interstitial between matches, never during one, as rarely as for GamePix (Y8 also caps them itself).
// Paused in beforeAd and resumed in afterAd, as its guide says; a skipped break calls neither, and the game
// carries on whatever happens (no SDK, an ad blocker, an error, a break that never reports back).
let y8Request = 0;
async function y8Break() {
  const sdk = window.y8Sdk;
  if (!sdk?.showAd || paused || matchesSinceAd < adEveryMatches || Date.now() - lastAd < adGapMs) return;
  matchesSinceAd = 0;
  lastAd = Date.now();
  const request = ++y8Request;
  await new Promise(resolve => {
    let ended = false;
    let started = false;
    // This deadline releases the waiting menu action. The SDK may still display its ad later.
    let timer = setTimeout(() => { if (!started) resolve(); }, y8AdStartMs);
    const finish = () => {
      if (ended || request !== y8Request) return;
      ended = true;
      clearTimeout(timer);
      adPaused = false;
      refreshPause();
      resolve();
    };
    try {
      Promise.resolve(sdk.showAd({
        type: 'next', name: 'match-end',
        beforeAd: () => {
          if (ended || started || request !== y8Request) return;
          started = true;
          clearTimeout(timer);
          timer = setTimeout(finish, y8AdLimitMs);
          adPaused = true;
          refreshPause();
        },
        afterAd: finish,
        adBreakDone: finish
      })).catch(finish);
    } catch {
      finish();
    }
  });
}

// CrazyGames SDK v3. Every call throws outside CrazyGames, so only use it there.
export async function initPortal() {
  if (portal === 'gamedistribution') {
    gd = createGdAds({
      getSdk: () => window.gdsdk,
      pause: value => { sdkPaused = value; refreshPause(); },
      showContinue: showGdContinue
    });
    window.oddbirdleGdEvent = event => gd.event(event);
    for (const event of window.oddbirdleGdEvents ?? []) gd.event(event);
    window.oddbirdleGdEvents = [];
    const stage = document.querySelector('#stage');
    if (stage) stage.inert = true;
    try { await window.oddbirdleGdReady; }
    finally { if (stage) stage.inert = false; }
    return;
  }
  if (portal === 'gamepix') {
    initGamepix();
    return;
  }
  if (portal === 'y8') {
    initY8();
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
  if (portal !== 'gamepix') return;
  try {
    if (gamepix) {
      gamepixCall(g => g.lifecycle.loading(100));
      // The cover and the locked menu wait for GamePix's answer, but not for good (10 s), so the game can always start.
      let timer;
      const answered = await Promise.race([
        Promise.resolve(gamepix.lifecycle.loaded()).then(() => true),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), gamepixLoadedMs); })
      ]).finally(() => clearTimeout(timer));
      ready = answered;
    }
  } catch {
    // Carry on without it.
  } finally {
    document.querySelector('#gamepix-loading')?.remove();
    const stage = document.querySelector('#stage');
    if (stage) stage.inert = false;
  }
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
  if (closedPortal) return code;
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
  if (closedPortal) return paused || sdkMuted;
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
