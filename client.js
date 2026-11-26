import {
  center, clamp, createGame, createTwinShuttleGame, floor, height, leftLine, netTop, racketRadius, rightLine, setMirroredShapes, shuttleOutline,
  step, width, contactMotion, isSwing, projectStrike, forceAt, effectIds, shapeCount, shuttleSizeOptions, racketTouches,
  posesBetween, sweptTouch, supportedShuttleY, swingMotion, trialEffectIds, trialEffectLabels, trampolineLift,
  trampolineDent, threeTouchLimit, touchLimitReason, touchLimitFault
} from './game.js';
import { makeStands, drawStands, createBombCrowdMotion, standsBottom, standsWall, mix } from './stands.js';
import { createCrowd } from './crowd.js';
import { drawCard, cardWidth, cardHeight } from './card.js';
import { bonusUnlocked, visibleStages } from './stages.js';
import { createStageProgress } from './stage-progress.js';
import { verdictFor } from './card-lines.js';
import { createMatchStats } from './match-stats.js';
import { createDailyClient, streakOf } from './daily-client.js';
import { playableDaily } from './daily.js';
import { dayLabel } from './card-rank.js';
import { createLinkQuality } from './link-quality.js';
import { createFrameMeter } from './frame-meter.js';
import { fullscreenElement, fullscreenSupported, toggleFullscreen } from './fullscreen.js';
import { launchConfetti, confettiAt } from './confetti.js';
import { createPlayback, followStrikeClock, legacyTuning } from './playback.js';
import { createRacketSender } from './net-send.js';
import { createNetMeter } from './net-quality.js';
import { inviteUrl, normalizeRoomCode, roomFromLink, roomLink, roomFromInvite } from './room-link.js';
import { createDemo } from './demo.js';
import { startHeartbeat, track, trackVisit } from './analytics.js';
import { features } from './features.js';
import { createAppStorage } from './app-storage.js';
import { shareCardImage, shareInvite } from './app-share.js';
import { createDuoTouch } from './duo-touch.js';
import { createAccount } from './app-account.js';
// The stage list and its saved clears: in the Reddit app always, in the phone app when it is built with `stages`.
const stagesOn = portal === 'reddit' || (portal === 'app' && features.stages);
import { landscapeOnly, touchLayout } from './touch-layout.js';
import { createSound } from './sound.js';
import { createCueTracker } from './sound-cues.js';
import {
  createJuiceTracker, dustAt, hintSeen, juiceKeys, juiceTiming, makeDust, markHintSeen, noteCpuWin,
  resetJuiceRecords, shockFlicker, shockJolt, squashAmount
} from './juice.js';
import {
  initPortal, isInstantMultiplayer, loadingStart, loadingStop, matchBreak, matchEnded, onJoinRoom, onPortalMute, onPortalPause,
  canPostCard, canShareCard, closedPortal, expandRedditView, exitRedditExpanded, onRedditViewMode, redditName, redditViewMode, redditIdentity, coordinatedBreak, portal, portalInviteLink, portalInviteRoom, portalMuted, roomFull, roomLeft, roomOpen, serverBase, setAppPaused,
  setPlaying, siteUrl
} from './portal.js';

const court = document.querySelector('#court');
const ctx = court.getContext('2d');
// A separate diagnostics ZIP enables this; release builds show no diagnostic UI.
const frameDiagnostics = document.documentElement.dataset.gdDiagnostics === 'true';
const frameMeter = frameDiagnostics ? createFrameMeter() : undefined;
let frameReport;
let lastFrameReport = 0;
if (frameDiagnostics) {
  frameReport = document.createElement('output');
  frameReport.style.cssText = 'position:fixed;top:4px;left:4px;z-index:9999;padding:5px 8px;white-space:pre;background:#182223e8;color:#e8ebd6;font:650 12px "Space Grotesk",sans-serif;pointer-events:none';
  frameReport.textContent = 'Measuring FPS…';
  document.body.append(frameReport);
  document.addEventListener('visibilitychange', () => frameMeter.reset());
}
const stage = document.querySelector('#stage');
const scoreboard = document.querySelector('#score');
const touchRule = document.querySelector('#touch-rule');
const sideLabel = document.querySelector('#side-label');
const cpuLabel = document.querySelector('#cpu-label');
const shuttleLights = [
  { element: document.querySelector('#you-shuttle-lights'), side: 'left', label: 'You' },
  { element: document.querySelector('#cpu-shuttle-lights'), side: 'right', label: 'CPU' }
];
const doublesTurnLabel = document.querySelector('#doubles-turn');
const youFlag = document.querySelector('#you-flag');
const winnerLabel = document.querySelector('#winner');
const recordLabel = document.querySelector('#record');
const rematchLabel = document.querySelector('#rematch-status');
const pauseOverlay = document.querySelector('#pause-overlay');
const pauseTitle = document.querySelector('#pause-title');
const pauseDetail = document.querySelector('#pause-detail');
const status = document.querySelector('#status');
const eventBanner = document.querySelector('#event-banner');
const shuttleCallsLabel = document.querySelector('#shuttle-calls');
const gameControl = document.querySelector('#game-control');
const resultActions = document.querySelector('#result-actions');
const playAgainButton = document.querySelector('#play-again');
const playAgainLabel = playAgainButton.querySelector('.label');
const nextStageButton = document.querySelector('#next-stage');
const toMenuButton = document.querySelector('#to-menu');
const cardButton = document.querySelector('#card-button');
const cardLabel = document.querySelector('#card-label');
const menu = document.querySelector('#menu');
const cpuLevelButton = document.querySelector('#cpu-level');
const stagesButton = document.querySelector('#stages-button');
const stagePanel = document.querySelector('#stage-panel');
const dailyButton = document.querySelector('#daily-button');
const stageList = document.querySelector('#stage-list');
const stageProgressLabel = document.querySelector('#stage-progress');
// The phone app's DAILY and account screens.
const accountPanel = document.querySelector('#account-panel');
const byId = id => document.querySelector('#' + id);
const stageCount = document.querySelector('#stage-count');
const stageScore = document.querySelector('#stage-score');
const stageBar = document.querySelector('#stage-bar i');
const stageIntro = document.querySelector('#stage-intro');
const stageIntroNumber = document.querySelector('#stage-intro-number');
const stageIntroName = document.querySelector('#stage-intro-name');
const stageIntroDescription = document.querySelector('#stage-intro-description');
const stageIntroGoal = document.querySelector('#stage-intro-goal');
const goalLabel = document.querySelector('#goal');
const resultStagesButton = document.querySelector('#result-stages');
const back = document.querySelector('#back');
const roomDisplay = document.querySelector('#room-display');
const roomCode = document.querySelector('#room-code');
const joinForm = document.querySelector('#join-form');
const codeInput = document.querySelector('#code-input');
const lobbyMessage = document.querySelector('#lobby-message');
const queueStatus = document.querySelector('#queue-status');
const notice = document.querySelector('#notice');
let noticeTimer;
// A short notice over the court: the opponent left, the connection dropped.
function showNotice(text, ms = 3500) {
  setText(notice, text);
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, ms);
}
const copyLink = document.querySelector('#copy-link');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const palettes = [
  { page: '#182223', court: '#e8ebd6', ink: '#274d3b', pageHover: '#293737', courtHover: '#d7dec6',
    floor: '#c0cbb4', line: '#6d8e72', net: '#476755' },
  { page: '#202831', court: '#e1e8ea', ink: '#304a5c', pageHover: '#313e4a', courtHover: '#d0dce1',
    floor: '#b9c9d1', line: '#718c9e', net: '#506b7d' },
  { page: '#2c2630', court: '#ece4ec', ink: '#5a3f5b', pageHover: '#403543', courtHover: '#e0d3e0',
    floor: '#cfbecd', line: '#967a94', net: '#765874' },
  { page: '#2b2722', court: '#efe6d6', ink: '#554839', pageHover: '#40372d', courtHover: '#e4d7c3',
    floor: '#d4c3aa', line: '#9b8262', net: '#76634e' }
];
const palette = palettes[Math.floor(Math.random() * palettes.length)];
for (const [property, value] of Object.entries({
  page: palette.page, court: palette.court, ink: palette.ink,
  'page-hover': palette.pageHover, 'court-hover': palette.courtHover
})) {
  document.documentElement.style.setProperty('--' + property, value);
}

// ?test=effects opens a CPU match with buttons for trying each random effect (&fast=1: they come sooner).
// Portals with strict reviews get no test or debug pages, whatever the address says.
const testParams = new URLSearchParams(closedPortal ? '' : location.search);
const testEffects = testParams.get('test') === 'effects';
const testShapes = testParams.get('test') === 'shapes';
// ?test=freeze / balloon / shock: a CPU Lv.4 match where the random effect is always that one (for recording).
// The trial effects (bumper, decoy, trampoline) can only be seen this way or from the ?test=effects buttons.
const onlyEffectTest = ['freeze', 'balloon', 'shock', 'bomb', ...trialEffectIds].includes(testParams.get('test')) ? testParams.get('test') : undefined;
const debugNet = testParams.get('debug') === 'net';
// ?net=old: the earlier playback and unbundled touch input, to compare on the same phones.
const oldNet = testParams.get('net') === 'old';
// ?net=before: the playback of the version before burst cushioning, for comparing side by side.
const beforeNet = testParams.get('net') === 'before';
const netDebug = { states: 0, rtts: [], frames: [] };
// While an online match runs: round trips, how late packets run and the frame rate, boiled down at
// the end to coarse buckets (see net-quality.js). Nothing here leaves the page except those buckets.
const netMeter = createNetMeter();
// Once a match is over, or the player leaves one that has run a while, send its summary (once).
function reportNet() {
  const { starved, frames } = playback.stats;
  const summary = netMeter.summary({
    guessedPct: starved / Math.max(1, frames) * 100, touch: racketIsTouch, link: navigator.connection?.effectiveType
  });
  netMeter.end();
  if (summary) track('net_quality', summary);
}
// Phones report a touch many times a frame: their racket moves are bundled (see net-send.js).
let racketIsTouch = false;
const racketSender = createRacketSender(message => send(message), { interval: () => (racketIsTouch && !oldNet ? 33 : 0) });
// ?test=juice opens a CPU Lv.4 match with switches for each screen touch below.
const testJuice = testParams.get('test') === 'juice';
const testThreeTouches = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && testParams.get('test') === 'touches';
// The Android app plays the website's FREE PLAY as it is, bomb included; the other portal builds keep theirs without it.
const singles = createGame({
  withCpu: true, bombEffects: !portal || portal === 'app', touchLimit: threeTouchLimit,
  quickEvents: (testEffects || onlyEffectTest) && testParams.get('fast') === '1'
});
let solo = singles;
// 2 PLAYERS (the app): two people on one device. The same game without a CPU, each racket moved by its own half of the screen.
const duoGame = createGame({ twoPlayers: true });
let duo = false;
const demo = createDemo();
const sound = createSound();
const soundCues = createCueTracker();
const soundToggle = document.querySelector('#sound-toggle');
const fullscreenToggle = document.querySelector('#fullscreen-toggle');
// Two CPUs rally quietly behind the menus; the court stays still for reduced motion.
// A first-time visitor sees the plain main screen: a silent match running behind the menu would
// look like a game without sound. The demo starts once they have made their first hit.
const demoShowing = () => mode !== 'solo' && mode !== 'online' && !reduceMotion.matches && !hint.shown;
const demoAlpha = { racket: 0.4, bird: 0.75 };
const ready = { phase: 'ready' };
let socket;
let onlineView;
let latestOnlineTime;
const playback = createPlayback(oldNet ? legacyTuning : beforeNet ? { peakWindowMs: 0 } : {});
let mode = 'menu';
let onlineRound;
let rematchReady = false;
let rematchStatus = '';
let breakPending = false;

// One menu action at a time: repeated taps must not start two games after the same ad.
async function afterMatchBreak(action, options) {
  if (breakPending) return;
  breakPending = true;
  if (coordinatedBreak) stage.inert = true;
  try {
    // Stop waiting for an opponent before an ad can take over a quick-match CPU game.
    if (coordinatedBreak && quick.on && mode === 'solo' && socket) leave('', true);
    await matchBreak(options);
    action();
    if (coordinatedBreak && quick.on && mode === 'solo' && !socket) connect({ type: 'queue' }, 'quick');
  } finally {
    stage.inert = false;
    breakPending = false;
  }
}
let joinVia = 'create';
let finishedNoted = false;
let selectedCpuLevel;
let selectedStage;
let stageIntroRemaining = 0;
let localSide = 'left';
// CPU games: the game itself always has the player on the left (the CPU plays the right), and half the matches are
// shown mirrored so that the player appears on the right.
let cpuMirrored = false;
const mirrored = () => mode === 'solo' && cpuMirrored;
// The half of the screen the player is on.
const shownSide = () => mode === 'solo' ? (cpuMirrored ? 'right' : 'left') : localSide;
let localRacket;
let lastFrame;
let lastHold = -Infinity;
let displayedShuttle;
let displayedFrozen = false;
let displayedSupport;
let prediction;
let predictedFlight;
let localOverlap = false;
let accumulator = 0;

// Screen-only touches (juice.js). Each can be switched off; the moving ones stay off for reduced motion.
const juice = Object.fromEntries(juiceKeys.map(key => [key, true]));
const juiceTracker = createJuiceTracker();
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const moving = key => juice[key] && !reduceMotion.matches;
const squashes = {};
let dust = [];
const hint = { shown: !hintSeen(storage), fading: undefined };
const beatenThisVisit = new Set();
let recordText = '';
let recordNoted = false;

function resize() {
  const bounds = court.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  court.width = Math.round(bounds.width * ratio);
  court.height = Math.round(bounds.height * ratio);
  ctx.setTransform(court.width / width, 0, 0, court.height / height, 0, 0);
  // How much bigger than the old 940 wide court this one is: the words over the court grow with it (index.html).
  const grow = Math.min(Math.max(bounds.width / 940, 1), 1.4).toFixed(3);
  if (grow !== shownGrow) document.documentElement.style.setProperty('--grow', shownGrow = grow);
  if (portal === 'app') { courtBounds = bounds; sizeBleed(); paintAppBackground(bounds); }
}
let shownGrow;

// The app: no dark margins. The page behind the court is painted in the court's own bands (wall behind the crowd, court,
// floor), lined up with the canvas, so the court seems to run out to every edge of the screen, the notch sides and the
// home-indicator strip included. The play area itself is unchanged.
let shownBands = '';
let shownProps = '';
let courtBounds;

// The app: where the player's racket cannot go (the strip past the court's outer edge, which its centre may not enter) turns
// a soft translucent red as the racket comes near the edge, deeper the closer it is, and clears as it moves away. Only the
// edge on the player's own side: the net side is plain to see. This canvas covers the whole screen and carries just that tint.
const bleed = [];
let bleedCanvas, bleedCtx, bleedDirty = false;
const bleedReach = 80; // court units from the edge where the tint starts
const bleedAlpha = 0.3;
function ensureBleed() {
  if (bleedCanvas) return;
  bleedCanvas = document.createElement('canvas');
  bleedCanvas.setAttribute('aria-hidden', 'true');
  bleedCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;aspect-ratio:auto;background:transparent;pointer-events:none;z-index:2';
  document.body.append(bleedCanvas);
  bleedCtx = bleedCanvas.getContext('2d');
}
function sizeBleed() {
  ensureBleed();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  bleedCanvas.width = Math.round(innerWidth * ratio);
  bleedCanvas.height = Math.round(innerHeight * ratio);
  bleedCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
// What the app lays over the whole screen, the strips beside the court included: the bomb's red wash on its half, the soft red
// where the player's racket cannot go, the racket's own part past the edge, and last the shock veil.
let overlayFx = {};
function drawOverlay() {
  if (!bleedCtx || !courtBounds) return;
  if (!bleed.length && !overlayFx.bomb && !overlayFx.veil && !bleedDirty) return;
  bleedCtx.clearRect(0, 0, innerWidth, innerHeight);
  bleedDirty = false;
  const b = courtBounds;
  if (overlayFx.bomb) {
    const mid = b.left + center * (b.width / width), floorY = b.top + floor * (b.height / height);
    const red = bleedCtx.createLinearGradient(0, 0, 0, floorY);
    red.addColorStop(0, '#d334337f');
    red.addColorStop(0.43, '#d33433');
    bleedCtx.save();
    bleedCtx.fillStyle = red;
    bleedCtx.globalAlpha = overlayFx.bomb.alpha;
    if (overlayFx.bomb.x < center) bleedCtx.fillRect(0, 0, mid, floorY);
    else bleedCtx.fillRect(mid, 0, innerWidth - mid, floorY);
    bleedCtx.restore();
    bleedDirty = true;
  }
  for (const racket of bleed) {
    const fromLeft = racket.x < width / 2;
    const distance = fromLeft ? racket.x : width - racket.x;
    const near = Math.min(1, Math.max(0, 1 - distance / bleedReach));
    if (near <= 0) continue;
    bleedCtx.fillStyle = `rgba(214, 72, 72, ${(bleedAlpha * near * near).toFixed(3)})`;
    if (fromLeft) bleedCtx.fillRect(0, 0, b.left, innerHeight);
    else bleedCtx.fillRect(b.right, 0, innerWidth - b.right, innerHeight);
    bleedDirty = true;
    // The racket is still a whole circle: the part that goes past the court edge is drawn here, over the tint.
    const sx = b.width / width, sy = b.height / height;
    const cx = b.left + racket.x * sx, cy = b.top + racket.y * sy, r = racket.r * sx;
    if (cx - r < b.left || cx + r > b.right) {
      bleedCtx.save();
      bleedCtx.beginPath();
      bleedCtx.rect(0, 0, b.left, innerHeight);
      bleedCtx.rect(b.right, 0, innerWidth - b.right, innerHeight);
      bleedCtx.clip();
      bleedCtx.beginPath();
      bleedCtx.arc(cx, cy, r, 0, Math.PI * 2);
      bleedCtx.fillStyle = racket.fill;
      bleedCtx.fill();
      bleedCtx.lineWidth = 2;
      bleedCtx.strokeStyle = racket.stroke;
      bleedCtx.stroke();
      bleedCtx.restore();
    }
  }
  if (overlayFx.veil) {
    for (const [color, alpha] of [['#0b1410', overlayFx.veil.dark], ['#ffffff', overlayFx.veil.light]]) {
      if (alpha <= 0) continue;
      bleedCtx.fillStyle = color;
      bleedCtx.globalAlpha = alpha;
      bleedCtx.fillRect(0, 0, innerWidth, innerHeight);
    }
    bleedCtx.globalAlpha = 1;
    bleedDirty = true;
  }
}
// Props on the floor beside the court, drawn in court units (scale) so they keep the court's proportions.
function paintAppProps(bounds, scale) {
  // (An HTML container, so the parser puts the <svg> in its own namespace: the app build lists no web addresses.)
  let box = document.querySelector('#app-props');
  if (!box) {
    box = document.createElement('div');
    box.id = 'app-props';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:-1';
    document.body.prepend(box);
  }
  const strip = bounds.left;
  const floorTop = bounds.top + floor * scale;
  const frame = palette.court, ink = palette.ink;
  const wood = mix(frame, ink, 0.42), soft = mix(frame, ink, 0.28), bag = mix(frame, ink, 0.62);
  // Sized to fit the strip with a margin (never cut by the screen edge or the court), the chair behind and the bag in front.
  const fit = Math.min(scale * 0.8, (strip - 14) / 74);
  const chairX = 8 + 27 * fit, chairBase = Math.round(floorTop + 24 * scale);
  const bagX = Math.min(strip - 8 - 28 * fit, chairX + 27 * fit + 4 + 26 * fit), bagBase = Math.round(floorTop + 44 * scale);
  const markup = strip < 46 ? '' : `
    <g transform="translate(${chairX} ${chairBase}) scale(${fit})" fill="${wood}">
      <rect x="-23" y="-110" width="5" height="110"/><rect x="18" y="-110" width="5" height="110"/>
      <rect x="-27" y="-118" width="54" height="8"/><rect x="-23" y="-152" width="5" height="34"/><rect x="-23" y="-152" width="30" height="5"/>
      <rect x="-18" y="-60" width="36" height="4" fill="${soft}"/><rect x="-18" y="-84" width="36" height="4" fill="${soft}"/><rect x="-18" y="-36" width="36" height="4" fill="${soft}"/>
      <rect x="-19" y="-127" width="38" height="9" rx="4" fill="${bag}"/>
    </g>
    <g transform="translate(${bagX} ${bagBase}) scale(${fit})">
      <rect x="-26" y="-27" width="40" height="27" rx="9" fill="${bag}"/>
      <rect x="-17" y="-35" width="22" height="10" rx="5" fill="none" stroke="${bag}" stroke-width="3"/>
      <rect x="19" y="-25" width="9" height="25" rx="3" fill="#7fae94"/><rect x="20.5" y="-29" width="6" height="5" rx="2" fill="${wood}"/>
    </g>`;
  if (markup === shownProps) return;
  shownProps = markup;
  box.innerHTML = `<svg width="${innerWidth}" height="${innerHeight}">${markup}</svg>`;
}
function paintAppBackground(bounds) {
  const scale = bounds.height / height;
  const wallEnd = Math.round(bounds.top + standsBottom * scale);
  const floorTop = Math.round(bounds.top + floor * scale);
  const bands = `linear-gradient(to bottom, ${standsWall(palette)} 0 ${wallEnd}px, ${palette.court} ${wallEnd}px ${floorTop}px, ${palette.floor} ${floorTop}px)`;
  // The strips beside the court are out of play: a few things stand on the floor out there (an umpire chair, a racket bag),
  // so it reads as the side of the hall. (A racket that goes to the edge shows what it cannot reach in red: see drawRacketBleed.)
  paintAppProps(bounds, scale);
  const painted = bands;
  if (painted === shownBands) return;
  shownBands = painted;
  document.documentElement.style.background = painted;
  document.documentElement.style.setProperty('--app-court-ink', palette.ink);
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setMode(next, message = '') {
  if (next !== mode) soundCues.reset();
  mode = next;
  menu.hidden = next !== 'menu';
  stagePanel.hidden = next !== 'stages';
  accountPanel.hidden = next !== 'account';
  // Behind the account screen the title steps aside and the demo match keeps playing.
  stage.toggleAttribute('data-account', next === 'account');
  if (next === 'menu' && (portal === 'reddit' || portal === 'app') && typeof refreshDaily === 'function' && dailyReady) refreshDaily();
  roomDisplay.hidden = next !== 'waiting';
  joinForm.hidden = next !== 'join';
  back.hidden = next === 'menu';
  if (typeof layoutPad === 'function') layoutPad();
  if (typeof updateViewToggle === 'function') updateViewToggle();
  lobbyMessage.hidden = !message;
  setText(lobbyMessage, message);
  showPauseState();
  if (touchReady) layoutTouch();
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function resetPrediction() {
  displayedShuttle = undefined;
  displayedFrozen = false;
  displayedSupport = undefined;
  prediction = undefined;
  predictedFlight = undefined;
  localOverlap = false;
  lastHold = -Infinity;
  lastShown = undefined;
}

// stay: keep the current screen (quick match going back to its CPU game).
function leave(message = '', stay = false) {
  rematchReady = false;
  rematchStatus = '';
  onlineRound = undefined;
  latestOnlineTime = undefined;
  if (mode === 'online') reportNet();
  roomLeft();
  const previous = socket;
  socket = undefined;
  previous?.close();
  onlineView = undefined;
  playback.reset();
  resetPrediction();
  localRacket = undefined;
  localSide = 'left';
  if (stay) return;
  if (guideOpen) closeGuide();
  selectedStage = undefined;
  stageIntroRemaining = 0;
  stageIntro.hidden = true;
  youFlag.hidden = true;
  quick.on = false;
  duo = false;
  showQueueStatus();
  setMode('menu', message);
}

function connect(request, via = request.type === 'join' ? 'code' : 'create') {
  // The Reddit build never opens a connection to a match server (Devvit apps make no outside connections).
  if (portal === 'reddit') return;
  const join = request.type === 'join';
  const queueing = request.type === 'queue';
  // Builds without ONLINE (the first Android app) never open a connection.
  if (socket || gamePaused || !features.online) return;
  joinVia = via;
  // Quick match connects quietly while the CPU game keeps going.
  if (!queueing) setMode(join ? 'join' : 'connecting');
  quick.queued = false;
  const url = new URL('play', serverBase);
  if (!portal) url.searchParams.set('bomb', '1');
  // Secure whenever the server is (the app's own page is served under its own scheme, never from the server's address).
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(url);
  socket = connection;
  connection.addEventListener('open', () => {
    if (socket !== connection) return;
    if (queueing) updateQueue();
    else send({ ...request, restartBarrier: coordinatedBreak, touchLimit: threeTouchLimit });
  });
  connection.addEventListener('message', ({ data }) => {
    if (socket !== connection) return;
    const message = JSON.parse(data);
    switch (message.type) {
      case 'room':
        roomCode.value = message.code;
        setMode('waiting');
        roomOpen(message.code);
        track('room_create');
        break;
      case 'queued':
        quick.queued = true;
        showQueueStatus();
        break;
      case 'start':
        onlineRound = message.round;
        rematchReady = false;
        rematchStatus = '';
        if (queueing && mode === 'solo') {
          quick.found = performance.now();
          quick.finished = false;
          track('quick_match_found');
        }
        quick.queued = false;
        localSide = message.side;
        localRacket = undefined;
        onlineView = message.state;
        latestOnlineTime = message.time;
        playback.reset();
        netMeter.begin();
        linkQuality.reset();
        linkFrames = { frames: 0, starved: 0 };
        resetPrediction();
        playback.push(message.time, message.state, performance.now());
        setMode('online');
        flagYou();
        finishedNoted = false;
        roomFull(message.code ?? request.code ?? roomCode.value);
        track('game_start', { mode: 'online', via: queueing ? 'quick' : joinVia });
        showQueueStatus();
        break;
      case 'rematch_wait':
        if (message.round !== onlineRound) break;
        rematchReady = message.ready;
        rematchStatus = message.ready ? 'Waiting for opponent…' : 'Opponent ready. Play again?';
        break;
      case 'state':
        netDebug.states++;
        onlineView = message.state;
        latestOnlineTime = message.time;
        playback.push(message.time, message.state, performance.now());
        break;
      case 'pong':
        if (Number.isFinite(message.t)) {
          const now = performance.now();
          netMeter.rtt(now - message.t);
          // ?signal=1|2|3 pretends the connection has that many bars (1 = bad), to look at what the bars do.
          const pretend = forcedSignal ? [[320, 200, 12], [120, 60, 2], [30, 10, 0]][forcedSignal - 1] : undefined;
          const stats = playback.stats;
          const frames = stats.frames - linkFrames.frames;
          const guessed = frames > 20 ? (stats.starved - linkFrames.starved) / frames * 100 : 0;
          if (frames > 20 || frames < 0) linkFrames = { frames: stats.frames, starved: stats.starved };
          linkQuality.observe(pretend?.[0] ?? now - message.t, pretend?.[1] ?? stats.jitterP95, pretend?.[2] ?? guessed);
          if (debugNet) netDebug.rtts.push({ at: now, rtt: now - message.t });
        }
        break;
      case 'error':
        if (/away too long/i.test(message.message ?? '')) showNotice('YOU WERE AWAY TOO LONG');
        leave();
        setMode(join ? 'join' : 'menu', message.message);
        if (join) codeInput.focus();
        break;
      case 'left':
        showNotice('OPPONENT LEFT');
        // A quick-match opponent leaving just sends you back to the CPU game and the queue.
        if (queueing) backToQuick(quick.finished ? undefined : 'opponent left');
        else leave('Opponent left.');
        break;
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    const wasPlaying = mode === 'online';
    if (wasPlaying) showNotice('CONNECTION LOST');
    if (queueing) {
      if (wasPlaying) backToQuick(quick.finished ? undefined : 'connection lost');
      else {
        // Waiting connection dropped: keep playing the CPU and try again shortly.
        leave('', true);
        quick.queued = false;
        showQueueStatus();
        setTimeout(() => { if (quick.on && !gamePaused && !socket) connect({ type: 'queue' }, 'quick'); }, 5000);
      }
      return;
    }
    leave(wasPlaying ? 'Connection lost.' : 'Could not connect.');
  });
}

const matchStats = createMatchStats();
function updateHud(view) {
  if (mode === 'solo') matchStats.update(view);
  const { phase, score, eventText = '', eventWind = false, winner, message = '' } = view;
  if (stage.dataset.phase !== phase) stage.dataset.phase = phase;
  scoreboard.hidden = !score;
  touchRule.hidden = phase !== 'starting' || !score;
  if (!touchRule.hidden) setText(touchRule, view.touchLimit === threeTouchLimit ? '3 TOUCH LIMIT' : 'UNLIMITED TOUCHES');
  // The target is on screen all match (Reddit): "FIRST TO 5", under the score.
  const goalShown = (portal === 'reddit' || (stagesOn && !!selectedStage)) && !!score && Number.isInteger(view.pointsToWin);
  // The 3 TOUCH LIMIT line and the goal share the spot under the score: the goal waits until the rule has gone.
  goalLabel.hidden = !goalShown || !touchRule.hidden;
  if (goalShown) setText(goalLabel, 'FIRST TO ' + view.pointsToWin);
  sideLabel.hidden = mode !== 'online' && mode !== 'solo';
  sideLabel.dataset.side = shownSide();
  cpuLabel.dataset.side = shownSide() === 'left' ? 'right' : 'left';
  // Inside Reddit the player's own name stands where YOU does.
  const redditUser = portal === 'reddit' ? redditName() : '';
  sideLabel.textContent = duo ? 'P1' : redditUser ? 'u/' + (redditUser.length > 14 ? redditUser.slice(0, 13) + '…' : redditUser) : 'YOU';
  cpuLabel.hidden = mode !== 'solo' || (!view.cpuLevel && !duo);
  setText(cpuLabel, duo ? 'P2' : view.doubles ? 'CPU TEAM' : view.cpuLevel ? 'CPU Lv. ' + view.cpuLevel : '');
  for (const { element, side, label } of shuttleLights) {
    element.hidden = !view.shuttleWins || stageIntroRemaining > 0;
    if (element.hidden) continue;
    element.dataset.side = mirrored() ? (side === 'left' ? 'right' : 'left') : side;
    const wins = String(view.shuttleWins[side]);
    if (element.dataset.wins === wins) continue;
    element.dataset.wins = wins;
    element.setAttribute('aria-label', label + ': ' + wins + ' of 2 shuttles won');
  }
  doublesTurnLabel.dataset.side = shownSide();
  const turnMessage = view.fault ? (view.fault === 'left' ? 'WRONG PARTNER' : view.fault === 'leftB' ? 'PARTNER FAULT' : 'CPU TEAM FAULT')
    : '';
  doublesTurnLabel.hidden = !view.turn || !view.fault || stageIntroRemaining > 0;
  if (!doublesTurnLabel.hidden) setText(doublesTurnLabel, turnMessage);
  if (score) {
    const value = mirrored() ? score.right + ':' + score.left : score.left + ':' + score.right;
    if (scoreboard.value !== value) scoreboard.value = value;
  }
  winnerLabel.hidden = !winner;
  setText(winnerLabel, winner ? (duo ? (winner === 'left' ? 'P1 WINS' : 'P2 WINS') : winner === localSide ? 'You Win!' : 'You Lose..') : '');
  if (phase !== 'finished') recordNoted = false;
  const record = phase === 'finished' && (juice.record || selectedStage) ? recordText : '';
  recordLabel.hidden = !record;
  setText(recordLabel, record);
  setText(status, message);
  rematchLabel.hidden = mode !== 'online' || phase !== 'finished' || !rematchStatus;
  setText(rematchLabel, rematchStatus);
  const banner = view.bomb?.lit ? 'BOMB'
    : view.bomb && eventText === 'out' ? 'OUT' : eventText;
  eventBanner.hidden = !banner || stageIntroRemaining > 0;
  eventBanner.toggleAttribute('data-wind', eventWind);
  eventBanner.toggleAttribute('data-bomb-urgent', !!view.bomb?.lit && view.bomb.secondsLeft <= 2);
  eventBanner.toggleAttribute('data-touch-fault', banner === touchLimitFault);
  setText(eventBanner, mirrored() ? banner.replace(/[←→]/g, arrow => arrow === '←' ? '→' : '←') : banner);
  const calls = view.shuttleCalls?.flatMap(({ reason }, index) =>
    reason && (index > 0 || view.firstCallVisible) ? [`${index + 1} · ${(reason === touchLimitReason ? touchLimitFault : reason.toUpperCase())}`] : []).join('   /   ');
  shuttleCallsLabel.hidden = !calls || stageIntroRemaining > 0;
  setText(shuttleCallsLabel, calls ?? '');
  // During a CPU match the small restart icon; once any match is over, worded buttons to play again or leave.
  const finished = (mode === 'solo' || mode === 'online') && phase === 'finished';
  gameControl.hidden = mode !== 'solo' || finished || stageIntroRemaining > 0;
  resultStagesButton.hidden = !stagesOn || !finished;
  resultActions.hidden = !finished;
  playAgainButton.hidden = (mode === 'online' && rematchReady) || (mode === 'solo' && finished && !!selectedStage?.daily && !dailyCanRetry());
  setText(playAgainLabel, mode === 'online' ? 'REMATCH' : 'PLAY AGAIN');
  const againName = mode === 'online' ? 'Rematch' : 'Play again';
  playAgainButton.setAttribute('aria-label', againName);
  playAgainButton.title = againName;
  // After winning a stage, a button goes straight to the next one that is open.
  const following = stagesOn && mode === 'solo' && finished && selectedStage && !selectedStage.daily && view.winner === 'left' ? nextStageAfter(selectedStage) : undefined;
  nextStageButton.hidden = !following;
  // A card is for random matches, and for beating a boss; every ordinary stage would only flood the comments.
  const cardVisible = (canPostCard || canShareCard) && !duo && mode === 'solo' && finished && !!view.winner &&
    (selectedStage?.daily ? !!dailyResult : !selectedStage || cardStageIds.has(selectedStage.id));
  if (cardButton.hidden === cardVisible) { cardButton.hidden = !cardVisible; if (cardVisible) setCardState('ready'); }
}

// Counts each match that reaches its final point once.
function noteFinish(view) {
  if ((mode !== 'solo' && mode !== 'online') || view.phase !== 'finished' || finishedNoted || !view.winner) return;
  finishedNoted = true;
  if (duo) return;
  if (mode === 'online') reportNet();
  const result = view.winner === (mode === 'solo' ? 'left' : localSide) ? 'win' : 'lose';
  noteRecord(view, result);
  if (mode === 'solo' && selectedStage?.daily) reportDailyTry(view, result === 'win');
  else if (mode === 'solo' && selectedStage && result === 'win') {
    const cleared = stageProgress?.cleared ?? [];
    const unlocked = !bonusUnlocked(cleared) && bonusUnlocked([...cleared, selectedStage.id]);
    recordText = unlocked ? 'SECRET STAGE UNLOCKED' : stageLabel(selectedStage) + ' CLEARED ✓';
    stageProgress?.record(selectedStage.id);
  }
  matchEnded(result === 'win');
  track('game_finish', mode === 'solo'
    ? { mode: 'cpu', level: String(view.cpuLevel), result }
    : { mode: 'online', result });
}

// FIRST WIN vs Lv.N: the first time each CPU level is beaten (remembered on this device).
function noteRecord(view, result) {
  if (recordNoted) return;
  recordNoted = true;
  recordText = '';
  if (mode !== 'solo' || result !== 'win' || !view.cpuLevel) return;
  const first = noteCpuWin(storage, view.cpuLevel) && !beatenThisVisit.has(view.cpuLevel);
  beatenThisVisit.add(view.cpuLevel);
  if (first) recordText = 'FIRST WIN vs Lv.' + view.cpuLevel;
}

function currentView() {
  return mode === 'solo' ? solo.view() : onlineView ?? ready;
}

// The shuttle as shown on the previous frame and when (playback time), so a fast smash is checked along its whole path
// between frames, not only where it is drawn now.
let lastShown;
let hitSeenTime;
function predictContact(from, to, motion, time, moving = false) {
  const shuttle = displayedShuttle;
  if (!shuttle || (shuttle.x < center ? 'left' : 'right') !== localSide) {
    localOverlap = false;
    return false;
  }
  const overlaps = racketTouches(shuttle, to);
  if (localOverlap && !(moving && displayedSupport === localSide && isSwing(motion))) {
    if (!overlaps) localOverlap = false;
    return false;
  }
  if (!shuttle.canHit || prediction || predictedFlight === shuttle.flight) return false;
  const earlier = lastShown?.shuttle.flight === shuttle.flight && Number.isFinite(lastShown.time) ? lastShown : undefined;
  const path = earlier ? posesBetween(earlier.shuttle, shuttle) : [shuttle];
  const meet = sweptTouch(path, from, to);
  if (meet < 0) return false;
  // Tell the server the moment on the path where they met, so it checks the same pose.
  const now = playback.displayedTime;
  hitSeenTime = earlier && Number.isFinite(now) ? earlier.time + (now - earlier.time) * path[meet].fraction : now;
  localOverlap = overlaps;
  predictedFlight = shuttle.flight;
  // Still report the contact promptly for the server to score the fault, without predicting a return.
  if (shuttle.touchLimitReachedFor === localSide) return true;
  // A wind or balloon in progress shapes the flight the same way on the server.
  prediction = { shuttle: path[meet], motion, started: time, force: onlineView?.force };
  return true;
}

function drawStrike(pose, motion, elapsed, force) {
  const projected = projectStrike(pose, motion, elapsed / 1000, force);
  const bottom = Math.max(...shuttleOutline(projected).flat().map(point => point.y));
  projected.y = Math.min(projected.y, floor - bottom);
  return projected;
}

function predictedView(view, time) {
  if (!prediction) return view;
  if (view.phase !== 'live' || !view.shuttle) {
    prediction = undefined;
    return view;
  }
  const elapsed = Math.max(0, time - prediction.started);
  const strike = onlineView?.strike;
  const confirmed = strike?.side === localSide && strike.fromFlight === prediction.shuttle.flight &&
    view.shuttle.flight === strike.flight && !view.support;
  if (confirmed && !prediction.correction) {
    const targetAge = Math.max(0, playback.displayedTime - strike.time);
    if (!prediction.confirmed) {
      const local = drawStrike(prediction.shuttle, prediction.motion, elapsed, prediction.force);
      const server = drawStrike(strike.pose, strike.motion, elapsed, strike.force);
      prediction.confirmed = {
        age: elapsed, time, started: time, x: local.x - server.x, y: local.y - server.y,
        angle: local.angle - server.angle
      };
    }
    const sync = prediction.confirmed;
    sync.age = followStrikeClock(sync.age, targetAge, time - sync.time);
    sync.time = time;
    const weight = Math.max(0, 1 - (time - sync.started) / 90);
    const shuttle = drawStrike(strike.pose, strike.motion, sync.age, strike.force);
    if (!weight && Math.abs(sync.age - targetAge) <= 1) {
      prediction = undefined;
      return view;
    }
    prediction.lastPose = {
      ...shuttle, x: shuttle.x + sync.x * weight, y: shuttle.y + sync.y * weight,
      angle: shuttle.angle + sync.angle * weight
    };
    return { ...view, shuttle: prediction.lastPose };
  }

  if (!prediction.correction) {
    const projected = drawStrike(prediction.shuttle, prediction.motion, Math.min(elapsed, 280), prediction.force);
    if (!prediction.confirmed && view.shuttle.flight === prediction.shuttle.flight && elapsed < 280) {
      prediction.lastPose = projected;
      return { ...view, shuttle: projected, flash: Math.max(0, 0.22 - elapsed / 1000) };
    }
    const pose = prediction.lastPose ?? projected;
    prediction.correction = { started: time, x: pose.x - view.shuttle.x, y: pose.y - view.shuttle.y };
  }
  const { started, x, y } = prediction.correction;
  const weight = Math.max(0, 1 - (time - started) / 90);
  if (!weight) {
    prediction = undefined;
    return view;
  }
  return { ...view, shuttle: { ...view.shuttle, x: view.shuttle.x + x * weight, y: view.shuttle.y + y * weight } };
}

function setRacket(input) {
  if (mode === 'solo' && !stageIntroRemaining) solo.moveRacket('left', input);
  if (mode === 'online') {
    const previous = localRacket;
    const motion = input && !displayedFrozen ? swingMotion(previous ?? input, input) : { vx: 0, vy: 0 };
    localRacket = input ? { ...input, ...motion } : undefined;
    if (!input) localOverlap = false;
    if (previous && localRacket && displayedShuttle && localRacket.vy < 0 && !isSwing(localRacket) &&
        (displayedShuttle.x < center ? 'left' : 'right') === localSide &&
        supportedShuttleY(displayedShuttle, previous, localRacket) !== undefined) {
      localOverlap = true;
    } else if (input) {
      predictContact(previous ?? input, input, localRacket, performance.now(), true);
    }
    racketSender.push({ type: 'racket', input: input && { x: input.x, y: input.y, time: input.time }, seenTime: playback.displayedTime });
  }
}

// Set while the portal (GamePix) has the game paused.
let gamePaused = false;

function showPauseState() {
  // Nothing moves on a results screen, so it is never covered by the pause notice (Y8 pauses whenever the frame
  // loses focus, and a notice there looked like a game that would not go on).
  const showing = gamePaused && (mode === 'solo' || mode === 'online') && currentView().phase !== 'finished';
  pauseOverlay.hidden = !showing;
  stage.toggleAttribute('data-paused', showing);
  const online = mode === 'online';
  // Y8 pauses when the game loses focus, and a click on the game brings it back.
  // The iPhone has no back button: there the ← on the court is the way to the menu, and the notice only says tap.
  const appResume = portal === 'app' && window.Capacitor?.getPlatform?.() === 'ios' ? 'Tap to continue.' : 'Tap to continue. Back for the menu.';
  const resume = portal === 'y8' ? 'Click the game to continue.' : portal === 'app' ? appResume : 'Resume to continue.';
  setText(pauseTitle, online ? 'ONLINE MATCHES CANNOT BE PAUSED' : 'PAUSED');
  setText(pauseDetail, online ? 'The match continues while you are away. ' +
    (portal === 'y8' ? 'Click the game to return.' : portal === 'app' ? 'Tap to return.' : 'Resume to return.')
    : quick.on ? 'CPU game and matchmaking are paused. ' + resume : resume);
}

function moveRacket(event) {
  if (gamePaused) return;
  // A finger moves the racket by how far it slides (touchDrag): on the thumb pad when the phone is upright, anywhere on
  // the screen when it is on its side. Only the mouse puts the racket where the pointer is.
  if (event.pointerType !== 'mouse') return;
  const phase = currentView().phase;
  if ((phase !== 'live' && phase !== 'between' && phase !== 'starting') || !event.isPrimary) return;
  const bounds = court.getBoundingClientRect();
  const shownX = (event.clientX - bounds.left) * width / bounds.width;
  const x = mirrored() ? width - shownX : shownX;
  racketIsTouch = false;
  setRacket({
    x: localSide === 'left' ? clamp(x, 0, center - racketRadius) : clamp(x, center + racketRadius, width),
    y: clamp((event.clientY - bounds.top) * height / bounds.height, 0, floor),
    time: event.timeStamp
  });
}

// ---- Touch: a finger never sits on the racket. Wherever it lands, the racket moves by how far the finger slides (times
// the sensitivity), so it never jumps under the finger and the finger never hides it; how fast it slides is how hard the
// swing is. On a phone held upright the space under the court is a thumb pad for this (the court stays clear); on its
// side the whole court is. The mouse keeps the racket under the pointer as before. ----
// var: setMode() can run before this part of the file has (the test pages), and only lays out touch once it has.
var touchReady = false;
const touchGainKey = 'oddbirdle-pad-gain';
var deviceStorage; // the phone app's saved settings once they are read (app-storage.js)
let touchGain = 1.5;
try {
  const saved = Number(localStorage.getItem(touchGainKey));
  if (saved >= 0.8 && saved <= 3) touchGain = saved;
} catch {
  // The default.
}
const coarsePointer = window.matchMedia?.('(pointer: coarse)') ?? { matches: false };
const pad = document.querySelector('#pad');
const touchTuneToggle = document.querySelector('#touch-tune-toggle');
const touchTune = document.querySelector('#touch-tune');
const touchGainInput = document.querySelector('#touch-gain');
const touchGainValue = document.querySelector('#touch-gain-value');
// The app: touch speed is set with two square buttons (+ and −) around the value, instead of a slider.
if (portal === 'app') {
  const step = (name, label, change) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tune-step';
    button.id = name;
    button.textContent = label;
    button.setAttribute('aria-label', change > 0 ? 'Faster touch' : 'Slower touch');
    button.addEventListener('click', () => {
      const next = Math.round(Math.min(Number(touchGainInput.max), Math.max(Number(touchGainInput.min), Number(touchGainInput.value) + change)) * 20) / 20;
      touchGainInput.value = String(next);
      touchGainInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return button;
  };
  touchTune.prepend(step('touch-gain-up', '+', 0.1));
  touchTune.append(step('touch-gain-down', '−', -0.1));
}
const padHintKey = 'oddbirdle-pad-hint-done';
let padActive = false;
let touchTuneOpen = false;
let thumb;          // the finger being followed: { id, x, y }
let touchRacket;    // where the racket is on screen, in court units of the half it is shown on

// A phone held upright (touch, taller than wide): the court at the top, the TOUCH SPEED bar right under its icon row (the
// same place on the menu and in a match), and under that the menu buttons stacked, or in a match the thumb pad.
// The app is landscape only (touch-layout.js): never the upright pad or menu, whatever shape the window has.
const sidewaysOnly = landscapeOnly(document.documentElement.dataset);
const padMenu = document.querySelector('#pad-menu');
const menuHome = { parent: menu.parentNode, next: menu.nextSibling };
function layoutTouch() {
  const { landscape, view } = touchLayout({
    coarse: coarsePointer.matches, width: window.innerWidth, height: window.innerHeight, mode, landscapeOnly: sidewaysOnly
  });
  document.documentElement.toggleAttribute?.('data-pad', Boolean(view));
  if (document.documentElement.dataset) document.documentElement.dataset.padView = view;
  if (!landscape) touchTuneOpen = false;
  document.documentElement.toggleAttribute?.('data-landscape-touch', landscape);
  document.documentElement.toggleAttribute?.('data-touch-tune-open', touchTuneOpen);
  touchTuneToggle.hidden = !landscape;
  touchTuneToggle.setAttribute('aria-expanded', String(touchTuneOpen));
  touchTune.hidden = !(view || touchTuneOpen);
  // The menu buttons move under the court on the upright menu, and back into the court everywhere else.
  if (view === 'menu' && menu.parentNode !== padMenu) padMenu?.append(menu);
  if (view !== 'menu' && menu.parentNode !== menuHome.parent) menuHome.parent?.insertBefore(menu, menuHome.next);
  if (padMenu) padMenu.hidden = view !== 'menu';
  let space = 0;
  if (view === 'play') {
    pad.hidden = false;
    pad.style.height = '0px';
    // The page's own bottom padding (the app's gesture-bar inset; none on the website) stays clear of the pad too.
    const pagePad = parseFloat(window.getComputedStyle?.(document.body)?.paddingBottom) || 0;
    space = window.innerHeight - touchTune.getBoundingClientRect().bottom - 24 - pagePad;
    pad.style.height = Math.max(0, space) + 'px';
  }
  // Too little room under the court: then the finger plays on the court itself.
  padActive = view === 'play' && space >= 110;
  pad.hidden = !padActive;
  try { if (localStorage.getItem(padHintKey)) pad.dataset.used = ''; } catch { /* the hint shows every time */ }
}
window.addEventListener?.('resize', layoutTouch);
coarsePointer.addEventListener?.('change', layoutTouch);
window.addEventListener?.('orientationchange', () => setTimeout(layoutTouch, 250));
touchTuneToggle.addEventListener('click', () => {
  touchTuneOpen = !touchTuneOpen;
  layoutTouch();
});

function showTouchGain() {
  touchGainInput.value = String(touchGain);
  touchGainValue.textContent = touchGain.toFixed(1) + '×';
}
touchGainInput.addEventListener('input', () => {
  touchGain = Number(touchGainInput.value);
  touchGainValue.textContent = touchGain.toFixed(1) + '×';
  try { localStorage.setItem(touchGainKey, String(touchGain)); } catch { /* until this page closes */ }
  deviceStorage?.setItem(touchGainKey, String(touchGain));
});
showTouchGain();
touchReady = true;
layoutTouch();

function touchPush(time) {
  const phase = currentView().phase;
  if (gamePaused || (phase !== 'live' && phase !== 'between' && phase !== 'starting')) return;
  const left = shownSide() === 'left';
  touchRacket ??= { x: left ? center / 2 : center * 1.5, y: 280 };
  racketIsTouch = true;
  setRacket({ x: mirrored() ? width - touchRacket.x : touchRacket.x, y: touchRacket.y, time });
}

// Follows one finger on `surface` (the court or the pad).
function touchDrag(event, surface) {
  if (!event.isPrimary) return;
  if (event.type === 'pointerdown' || !thumb || thumb.id !== event.pointerId) {
    if (event.type !== 'pointerdown' && event.buttons === 0) return;
    thumb = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { surface.setPointerCapture(event.pointerId); } catch { /* moves over the surface still arrive */ }
    touchPush(event.timeStamp);
    return;
  }
  const scale = width / court.getBoundingClientRect().width * touchGain;
  const left = shownSide() === 'left';
  touchRacket ??= { x: left ? center / 2 : center * 1.5, y: 280 };
  touchRacket = {
    x: left ? clamp(touchRacket.x + (event.clientX - thumb.x) * scale, 0, center - racketRadius)
      : clamp(touchRacket.x + (event.clientX - thumb.x) * scale, center + racketRadius, width),
    y: clamp(touchRacket.y + (event.clientY - thumb.y) * scale, 0, floor)
  };
  thumb.x = event.clientX;
  thumb.y = event.clientY;
  touchPush(event.timeStamp);
}

// 2 PLAYERS: every finger is followed on its own (the one-player pad above follows only the first).
const duoTouch = createDuoTouch({
  screenWidth: () => window.innerWidth,
  scale: () => width / court.getBoundingClientRect().width * touchGain,
  center, width, floor, racketRadius
});
function duoDrag(event) {
  const moved = event.type === 'pointerdown' ? duoTouch.down(event.pointerId, event.clientX, event.clientY)
    : duoTouch.move(event.pointerId, event.clientX, event.clientY);
  if (!moved) return;
  if (event.type === 'pointerdown') {
    try { event.target.setPointerCapture(event.pointerId); } catch { /* moves over the surface still arrive */ }
  }
  const phase = currentView().phase;
  if (gamePaused || (phase !== 'live' && phase !== 'between' && phase !== 'starting')) return;
  solo.moveRacket(moved.side, { x: moved.racket.x, y: moved.racket.y, time: event.timeStamp });
}

function touchEnd(event) {
  if (!thumb || (event && event.pointerId !== thumb.id)) return;
  thumb = undefined;
  delete pad.dataset.held;
}

for (const type of ['pointerdown', 'pointermove']) {
  pad.addEventListener(type, event => {
    if (gamePaused) return;
    event.preventDefault();
    if (type === 'pointerdown') {
      pad.dataset.held = '';
      pad.dataset.used = '';
      try { localStorage.setItem(padHintKey, '1'); } catch { /* shown again next time */ }
    }
    touchDrag(event, pad);
  });
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, touchEnd);

// On its side (or with no room for the pad) the whole screen is the pad: a finger anywhere but on a button or the bar
// moves the racket by how far it slides.
const screenPadSkip = 'button, a, input, label, output, #pad, #touch-tune, #guide';
document.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' || padActive || gamePaused || (mode !== 'solo' && mode !== 'online')) return;
  if (event.target?.closest?.(screenPadSkip)) return;
  event.preventDefault?.();
  if (duo && mode === 'solo') { duoDrag(event); return; }
  touchDrag(event, event.target);
});
document.addEventListener('pointermove', event => {
  if (duo && duoTouch.has(event.pointerId)) { event.preventDefault?.(); duoDrag(event); return; }
  if (!thumb || event.pointerId !== thumb.id || event.target?.closest?.('#pad')) return;
  event.preventDefault?.();
  touchDrag(event, event.target);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  document.addEventListener(type, event => { duoTouch.up(event.pointerId); if (!event.target?.closest?.('#pad')) touchEnd(event); });
}

function drawRacket(position, fill, stroke, side) {
  ctx.beginPath();
  const squash = squashes[side];
  const amount = squash && juice.squash && !reduceMotion.matches ? squashAmount(performance.now() - squash.start) : 0;
  // Squash: a little flatter along the way the shuttle was sent, a little wider across it.
  const r = position.radius ?? position.r ?? racketRadius;
  if (amount) ctx.ellipse(position.x, position.y, r * (1 - amount), r * (1 + amount * 0.6), squash.angle, 0, Math.PI * 2);
  else ctx.arc(position.x, position.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  if (portal === 'app' && side !== undefined && side === localSide) bleed.push({ x: mirrored() ? width - position.x : position.x, y: position.y, r, fill, stroke });
}

function drawDoublesRackets(view) {
  const active = view.phase === 'starting' || view.phase === 'live';
  for (const [key, team, fill, stroke] of [
    ['leftB', 'left', '#a9d67844', palette.ink],
    ['rightB', 'right', '#cf936b66', '#774935'],
    ['right', 'right', '#cf936b99', '#774935'],
    ['left', 'left', '#a9d67899', palette.ink]
  ]) {
    const racket = view[key];
    if (racket) drawRacket(racket, fill, stroke, key === team ? key : undefined);
    if (active && view.turn[team] === key) {
      // A dashed outline marks the player's starting spot until a mouse or touch supplies a position.
      const { x, y } = racket ?? { x: 245, y: 300 };
      ctx.save();
      if (!racket) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(x, y, racketRadius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = palette.court;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawCourt(view) {
  const top = view.netTop ?? netTop;
  ctx.fillStyle = palette.court;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, floor, width, height - floor);
  const liveBomb = view.bomb?.lit && view.shuttle;
  const bombWash = liveBomb && portal !== 'app';
  if (liveBomb && portal === 'app') {
    overlayFx.bomb = { x: mirrored() ? width - liveBomb.x : liveBomb.x, alpha: 0.14 + 0.08 * (1 - clamp(view.bomb.fuse / 2.4, 0, 1)) };
  }
  const now = performance.now();
  const bombDuck = bombCrowdMotion.update(now, reduceMotion.matches ? undefined : liveBomb?.x);
  drawStands(ctx, standsFor(view), {
    gaze: view.gaze, gazes: view.gazes, palette, cheer: crowdNow.cheer, now, mood: crowdNow.mood,
    boo: reduceMotion.matches ? undefined : crowdNow.boo,
    jolt: reduceMotion.matches ? 0 : shockJolt(view.shake), bombDuck: reduceMotion.matches ? undefined : bombDuck
  });
  if (bombWash) {
    const left = liveBomb.x < center ? 0 : center;
    const red = ctx.createLinearGradient(0, 0, 0, floor);
    red.addColorStop(0, '#d334337f');
    red.addColorStop(0.43, '#d33433');
    ctx.save();
    ctx.fillStyle = red;
    ctx.globalAlpha = 0.14 + 0.08 * (1 - clamp(view.bomb.fuse / 2.4, 0, 1));
    ctx.fillRect(left, 0, center, floor);
    ctx.restore();
  }
  startConfetti(view);
  ctx.fillStyle = palette.line;
  ctx.fillRect(leftLine, floor, rightLine - leftLine, 8);
  if (view.trampoline) drawTrampoline(view.trampoline);

  ctx.fillStyle = palette.net;
  // NET CORD: the tape dips and shivers for a moment where the shuttle clipped it.
  const wobble = reduceMotion.matches ? 0 : view.cord?.wobble ?? 0;
  const dip = wobble * Math.abs(Math.sin(wobble * 26)) * 5;
  ctx.fillRect(center - 2, top + dip, 4, floor - top - dip);
  ctx.fillRect(center - 9, top + dip, 18, 4);
  ctx.fillStyle = '#f7f6e9';
  for (const x of [leftLine, center, rightLine]) ctx.fillRect(x - 2, floor, 4, 8);
}

// TRAMPOLINE: each half of the floor swells into a dome; where the shuttle landed it dents in, then springs back.
function drawTrampoline({ swell, press }) {
  const dent = press ? trampolineDent(press.age) : 0;
  const surface = x => floor - trampolineLift(x, swell) +
    (press ? dent * Math.exp(-(((x - press.x) / 55) ** 2)) : 0);
  ctx.fillStyle = palette.line;
  for (const [from, to] of [[leftLine, center - 8], [center + 8, rightLine]]) {
    ctx.beginPath();
    ctx.moveTo(from, floor + 8);
    for (let x = from; x <= to; x += 5) ctx.lineTo(x, surface(x));
    ctx.lineTo(to, surface(to));
    ctx.lineTo(to, floor + 8);
    ctx.closePath();
    ctx.fill();
  }
}

// BUMPER: a fixed round post that grows in, with a ring (like the one at a racket hit) when the shuttle bounces off.
function drawBumper({ x, y, r, size, ring }) {
  const radius = r * size;
  if (radius <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = palette.court;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (ring > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4 + (1 - ring) * 36, 0, Math.PI * 2);
    ctx.globalAlpha = ring;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// DECOY: the fakes look exactly like the real shuttle; a burst is a thin ring and a few shards.
function drawDecoys(view, alpha = 1) {
  for (const decoy of view.decoys ?? []) {
    ctx.save();
    drawShuttle({ flash: 0, phase: 'live', shuttle: decoy, frozen: false }, alpha);
    ctx.restore();
  }
}

function drawPops(pops) {
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = 'round';
  for (const pop of pops) {
    const t = pop.progress;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pop.x, pop.y, 10 + t * 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const angle = pop.angle + k * Math.PI / 4;
      ctx.moveTo(pop.x + Math.cos(angle) * (8 + t * 26), pop.y + Math.sin(angle) * (8 + t * 26));
      ctx.lineTo(pop.x + Math.cos(angle) * (16 + t * 40), pop.y + Math.sin(angle) * (16 + t * 40));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function draw(view, scenery = false) {
  ctx.clearRect(0, 0, width, height);
  bleed.length = 0;
  overlayFx = {};
  ctx.save();
  if (!scenery && mirrored()) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  if (view.shake && !reduceMotion.matches) {
    const t = view.shake;
    ctx.translate(Math.sin(t * 91) * 17 * t, Math.cos(t * 117) * 12 * t);
  }
  drawCourt(view);
  if (view.force?.type === 'wind') drawWind(view.force);
  if (view.phase !== 'ready') {
    if (scenery) ctx.globalAlpha = demoAlpha.racket;
    if (view.turn && !scenery) drawDoublesRackets(view);
    else {
      const other = localSide === 'left' ? 'right' : 'left';
      if (view[other]) drawRacket(view[other], '#cf936b99', '#774935', scenery ? undefined : other);
      // Online matches draw the locally predicted racket; a quick-match CPU game (which also
      // has a connection open while waiting) draws the game's own racket.
      const ownRacket = mode === 'online' && !scenery ? localRacket : view[localSide];
      if (ownRacket && view.phase !== 'finished') drawRacket(ownRacket, '#a9d67877', palette.ink, scenery ? undefined : localSide);
    }
    if (view.bumper) drawBumper(view.bumper);
    if (view.bomb && view.shuttle) drawBomb(view.shuttle, view.bomb);
    else if (view.shuttles) {
      for (const shuttle of view.shuttles) drawShuttle({ shuttle, phase: view.phase, flash: shuttle.flash });
      if (view.settledShuttle) drawShuttle({ shuttle: view.settledShuttle, phase: view.phase, flash: 0 });
    } else if (view.shuttle) drawShuttle(view, (scenery ? demoAlpha.bird : 1) * (view.shuttleAlpha ?? 1));
    ctx.globalAlpha = 1;
    if (view.shuttleClash) {
      const { x, y, age } = view.shuttleClash;
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - age / 0.22);
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, reduceMotion.matches ? 14 : 7 + age * 74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (view.bombBurst) drawBombBurst(view.bombBurst);
    drawDecoys(view);
    if (view.pops) drawPops(view.pops);
    if (!scenery) {
      drawDust();
      drawConfetti();
      drawHint(view);
    }
  }
  ctx.restore();
  // The app lays the shock veil and the bomb wash over the whole screen (the strips beside the court too), from drawOverlay.
  if (view.shake && !reduceMotion.matches && portal === 'app') overlayFx.veil = shockFlicker(view.shake);
  if (view.shake && !reduceMotion.matches && portal !== 'app') {
    const veil = shockFlicker(view.shake);
    for (const [color, alpha] of [['#0b1410', veil.dark], ['#ffffff', veil.light]]) {
      if (alpha <= 0) continue;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalAlpha = 1;
  }
  drawOverlay();
}

function drawDust() {
  if (!dust.length) return;
  const now = performance.now();
  ctx.save();
  ctx.fillStyle = palette.ink;
  dust = dust.filter(speck => {
    const at = dustAt(speck, now);
    if (!at) return false;
    ctx.globalAlpha = 0.7 * at.alpha;
    ctx.fillRect(at.x - at.size / 2, at.y - at.size, at.size, at.size);
    return true;
  });
  ctx.restore();
}

// First visit only: a faint "Move to hit" over the player's half until their first hit.
function drawHint(view) {
  if (duo || !hint.shown || !juice.hint || !['starting', 'live', 'between'].includes(view.phase)) return;
  let alpha = 0.35;
  if (hint.fading !== undefined) {
    const t = (performance.now() - hint.fading) / juiceTiming.hintFadeMs;
    if (t >= 1) {
      hint.shown = false;
      return;
    }
    alpha *= 1 - t;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.ink;
  ctx.font = '650 26px "Space Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.translate(localSide === 'left' ? center / 2 : center * 1.5, floor * 0.42);
  // Words read the right way round on a mirrored court.
  if (mirrored()) ctx.scale(-1, 1);
  ctx.fillText('Move to hit', 0, 0);
  ctx.restore();
}

function playJuice(events, time, side) {
  for (const event of events) {
    if (event.type === 'hit') {
      squashes[event.side] = { start: time, angle: event.angle };
      if (event.side === side && hint.shown && hint.fading === undefined) {
        hint.fading = time;
        markHintSeen(storage);
      }
    } else if (event.type === 'land' && moving('dust')) {
      dust.push(...makeDust(event.x, time));
    } else if (event.type === 'score' && event.side === side && moving('scorePop')) {
      scoreboard.animate?.([{ scale: 1.18 }, { scale: 1 }], { duration: juiceTiming.popMs, easing: 'ease-out' });
    }
  }
}

// Your connection as 1-3 bars beside the sound button, always shown. Nothing else is shown until you hover
// over the bars (mouse) or tap them (touch, 2.5 seconds): then "42 ms (Good)", the round trip and a word for it.
const linkQuality = createLinkQuality();
const forcedSignal = [1, 2, 3].includes(Number(testParams.get('signal'))) ? Number(testParams.get('signal')) : 0;
let linkNumberUntil = 0;
let linkFrames = { frames: 0, starved: 0 };
let linkHover = false;
const linkView = document.querySelector('#link-own');

function showLinkBars() {
  // Always on screen. Online it is your measured connection; in a CPU game or a menu nothing travels over the
  // network, so it simply shows full bars.
  const online = mode === 'online';
  const known = online && linkQuality.known;
  const level = online ? (known ? String(linkQuality.level) : '') : '3';
  const details = (online ? known : true) && (linkHover || performance.now() < linkNumberUntil);
  const text = !details ? '' : online ? linkQuality.rtt + ' ms (' + ['', 'Poor', 'Fair', 'Good'][linkQuality.level] + ')' : 'Offline (Good)';
  // The app shows the bars only in an online match: nothing travels in a CPU game, and the menu column stays tidy.
  if (portal === 'app') linkView.hidden = !online;
  if (linkView.dataset.level !== level) linkView.dataset.level = level;
  const word = linkView.querySelector('b');
  if (word.textContent !== text) word.textContent = text;
}
linkView.addEventListener('pointerenter', event => { linkHover = event.pointerType === 'mouse'; });
linkView.addEventListener('pointerleave', () => { linkHover = false; });
linkView.addEventListener('pointerdown', () => { linkNumberUntil = performance.now() + 2500; });

let stands;
let standsScore = -1;
let confetti;
// A new crowd for every match: the score going back down means a new one began.
// The deeper into the stages, the fuller the stands: nearly empty for stage 1, packed from the bosses on. (Practice
// matches keep their random crowd.)
const stageCrowd = id => Math.min(1, 0.12 + 0.88 * (id - 1) / 19);
function standsFor(view) {
  const total = view.score ? view.score.left + view.score.right : 0;
  if (!stands || total < standsScore) stands = makeStands(undefined, selectedStage ? (selectedStage.daily ? 0.85 : stageCrowd(selectedStage.id)) : undefined);
  standsScore = total;
  return stands;
}

// The crowd as of this frame (crowd.js): who cheers, who is standing, how the effect running affects them.
const crowd = createCrowd();
const bombCrowdMotion = createBombCrowdMotion();
let crowdNow = { cues: [], mood: undefined };

// At the end of a match, confetti drifts down over the winner's side.
function startConfetti(view) {
  if (view.phase === 'finished' && view.winner) {
    if (!confetti && !reduceMotion.matches) confetti = launchConfetti(view.winner, performance.now());
  } else if (view.phase !== 'finished') {
    confetti = undefined;
  }
}

function drawConfetti() {
  const pieces = confettiAt(confetti, performance.now());
  if (!pieces) return;
  const colorOf = color => color === 'ink' ? palette.ink : color === 'net' ? palette.net : color === 'line' ? palette.line : color;
  ctx.save();
  for (const piece of pieces) {
    ctx.fillStyle = colorOf(piece.color);
    ctx.globalAlpha = piece.alpha * 0.9;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.scale(piece.width, 1);
    ctx.beginPath();
    ctx.moveTo(0, -piece.size * 1.2);
    ctx.lineTo(piece.size * 0.8, 0);
    ctx.lineTo(0, piece.size * 1.2);
    ctx.lineTo(-piece.size * 0.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// GUST: faint streaks flowing the way the wind blows (still and fainter with reduced motion).
const streaks = Array.from({ length: 30 }, (_, i) => ({
  lane: (i * 0.618034) % 1, offset: (i * 0.381966 + 0.13) % 1, length: 36 + (i * 37) % 70, speed: 0.55 + ((i * 13) % 10) / 12
}));
function drawWind(force) {
  const { strength } = forceAt(force);
  if (!strength) return;
  const still = reduceMotion.matches;
  const clock = still ? 0 : performance.now() / 1000;
  const vertical = force.y !== 0;
  const sign = Math.sign(vertical ? force.y : force.x);
  ctx.save();
  ctx.globalAlpha = (still ? 0.08 : 0.2) * strength;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const streak of streaks) {
    const along = (((streak.offset + clock * streak.speed * 0.8 * sign) % 1) + 1) % 1;
    if (vertical) {
      const x = streak.lane * width;
      const y = along * (floor + 120) - 60;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - sign * streak.length);
    } else {
      const y = streak.lane * floor;
      const x = along * (width + 160) - 80;
      ctx.moveTo(x, y);
      ctx.lineTo(x - sign * streak.length, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawBomb({ x, y, size, angle }, { fuse, lit, remaining }) {
  const still = reduceMotion.matches;
  const urgent = lit && fuse <= 2.4;
  const glow = urgent && (still || Math.sin(fuse * (26 - 6 * fuse)) > 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = glow ? '#a82f23' : palette.ink;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();

  // Draw the unburnt section of the quadratic curve and put the ember on its moving tip.
  const t = 0.1 + 0.9 * remaining;
  const root = -size;
  const controlX = 6 * t;
  const controlY = root - 22 * t;
  const tipX = (1 - t) * controlX + t * (6 + 12 * t);
  const tipY = (1 - t) * controlY + t * (root - 22 + 7 * t);
  ctx.fillStyle = palette.net;
  ctx.fillRect(-4, root - 3, 8, 6);
  ctx.strokeStyle = '#825727';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, root);
  ctx.quadraticCurveTo(controlX, controlY, tipX, tipY);
  ctx.stroke();
  if (lit) {
    const flicker = still ? 0.5 : 0.5 + 0.5 * Math.sin(fuse * 44);
    ctx.fillStyle = '#eb6027';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4 + flicker * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffdc75';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (!still) {
      for (let i = 0; i < 3; i++) {
        const distance = 5 + ((fuse * 28 + i * 3) % 8);
        const direction = fuse * 8 + i * 2.1;
        ctx.fillRect(tipX + Math.cos(direction) * distance, tipY + Math.sin(direction) * distance, 2, 2);
      }
    }
  }
  ctx.restore();
}

function drawBombBurst({ x, y, age }) {
  const life = Math.max(0, 1 - age / 0.57);
  const radius = reduceMotion.matches ? 46 : 18 + (1 - life) * 76;
  ctx.save();
  ctx.globalAlpha = life;
  ctx.fillStyle = '#c54720';
  ctx.strokeStyle = '#be5829';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const angle = i * 2 * Math.PI / 7;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * radius * 0.82, y + Math.sin(angle) * radius * 0.82, 3 + life * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShuttle({ flash, phase, shuttle, frozen }, alpha = 1) {
  if (flash > 0 && phase === 'live') {
    ctx.beginPath();
    ctx.arc(shuttle.x, shuttle.y, 26 + (0.22 - flash) * 105, 0, Math.PI * 2);
    ctx.globalAlpha = alpha * flash / 0.22;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  ctx.beginPath();
  const rings = shuttleOutline(shuttle);
  for (const ring of rings) {
    ring.forEach((point, index) => {
      const x = shuttle.x + point.x;
      const y = shuttle.y + point.y;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  // FREEZE: the shuttle fades to a paler version of its own colour, in keeping with the palette.
  ctx.globalAlpha = frozen ? alpha * 0.4 : alpha;
  ctx.fillStyle = shuttle.color ?? (phase === 'live' ? palette.ink : palette.net);
  ctx.fill('evenodd');
}

let lastFrameErrorAt = -Infinity;
function frame(time) {
  try {
    advanceFrame(time);
  } catch (error) {
    // A failed draw may leave canvas transforms/clip state on the stack.
    lastFrame = undefined;
    accumulator = 0;
    if (time - lastFrameErrorAt >= 5000) {
      console.error('Odd Birdle frame failed', { mode, phase: stage.dataset.phase }, error);
      lastFrameErrorAt = time;
    }
    resize();
  } finally {
    requestAnimationFrame(frame);
  }
}

function advanceFrame(time) {
  // Freeze only this client's presentation. Online snapshots keep arriving;
  // resuming jumps to the current server state instead of replaying a backlog.
  if (gamePaused) {
    lastFrame = undefined;
    accumulator = 0;
    frameMeter?.reset();
    return;
  }
  const workStart = frameMeter ? performance.now() : 0;
  // On a mirrored CPU court the shuttle shapes are built back to front so they look right and hit as they look.
  setMirroredShapes(mirrored());
  if (debugNet) netDebug.frames.push(time);
  if (mode === 'online') netMeter.frame(time);
  const scenery = demoShowing();
  if (stageIntroRemaining > 0 && lastFrame !== undefined && !gamePaused) {
    stageIntroRemaining = Math.max(0, stageIntroRemaining - Math.min((time - lastFrame) / 1000, 0.05));
    if (!stageIntroRemaining) { stageIntro.hidden = true; accumulator = 0; flagYou(); }
  }
  if ((mode === 'solo' || scenery) && lastFrame !== undefined && !gamePaused && !(guideHold && !scenery) && !stageIntroRemaining) {
    accumulator += Math.min((time - lastFrame) / 1000, 0.05);
    while (accumulator >= step) {
      if (scenery) demo.advance(step);
      else solo.simulate(step);
      accumulator -= step;
    }
  }
  lastFrame = time;
  const view = mode === 'online' ? playback.at(time) ?? currentView() : currentView();
  if (view.frozen) {
    prediction = undefined;
    localOverlap = false;
  }
  if (view.frozen && localRacket) Object.assign(localRacket, { vx: 0, vy: 0 });
  displayedFrozen = view.frozen;
  displayedSupport = view.support;
  displayedShuttle = view.phase === 'live' && !view.frozen ? view.shuttle : undefined;
  if (mode === 'online' && localRacket && view.phase === 'live' && !view.frozen) {
    const hit = predictContact(localRacket, localRacket, contactMotion(localRacket, time), time);
    if (hit || time - lastHold >= 45) {
      lastHold = time;
      send({ type: 'hold', seenTime: hit ? hitSeenTime : playback.displayedTime, time });
    }
  }
  lastShown = mode === 'online' && displayedShuttle ? { shuttle: displayedShuttle, time: playback.displayedTime } : undefined;
  noteFinish(view);
  if (quick.on) {
    if (mode === 'online' && view.phase === 'finished') quick.finished = true;
    if (quick.found && mode === 'online' && view.phase === 'live') {
      quick.found = undefined;
      track('quick_match_start');
    }
    showQueueStatus();
  }
  setPlaying((mode === 'solo' || mode === 'online') && view.phase !== 'finished');
  const demoView = scenery ? demo.view() : undefined;
  // Effect names from the demo show on the plain menus, not over codes or messages.
  const demoBanner = demoView && mode === 'menu' && !lobbyMessage.textContent;
  updateHud(demoBanner ? { ...view, eventText: demoView.eventText, eventWind: demoView.eventWind } : view);
  showLinkBars();
  let drawing = mode === 'online' ? predictedView(view, time) : view;
  // Windy Day: a quiet wind bed runs under the whole stage.
  sound.setBed('wind', mode === 'solo' && selectedStage?.rules.permanent === 'wind' && !stageIntroRemaining && !gamePaused && view.phase !== 'finished');
  if ((mode === 'solo' || mode === 'online') && !stageIntroRemaining) {
    for (const cue of soundCues.cues(drawing, time, mode === 'solo' ? 'left' : localSide)) {
      sound.play(cue, Boolean(view.shuttleCalls) &&
        (cue.startsWith('shuttle') || cue === 'pointWon' || cue === 'pointLost' || cue === 'win' || cue === 'lose'));
    }
  }
  const pose = drawing.shuttle;
  if (mode === 'online' && !view.frozen && pose && localRacket &&
      (pose.x < center ? 'left' : 'right') === localSide &&
      (view.support === localSide || (localOverlap && localRacket.vy < 0 && !isSwing(localRacket)))) {
    const y = supportedShuttleY(pose, localRacket, localRacket);
    if (y !== undefined) drawing = { ...drawing, shuttle: { ...pose, y } };
  }
  if (mode === 'solo' || mode === 'online') {
    const events = juiceTracker.update(drawing, time);
    const own = mode === 'solo' ? 'left' : localSide;
    playJuice(events, time, own);
    crowdNow = crowd.update(drawing, events, performance.now(), own);
    for (const cue of crowdNow.cues) sound.play(cue);
  } else {
    juiceTracker.reset();
    crowd.reset();
    crowdNow = { cues: [], mood: undefined };
  }
  if (scenery) draw(demoView, true);
  else draw(drawing);
  if (frameMeter) {
    if (gamePaused || document.hidden) frameMeter.reset();
    else frameMeter.record(time, performance.now() - workStart);
    if (time - lastFrameReport > 500) {
      lastFrameReport = time;
      const s = frameMeter.summary();
      frameReport.textContent = s
        ? `${s.fps.toFixed(0)} FPS | JS p95 ${s.workP95.toFixed(1)} ms | frame p95 ${s.gapP95.toFixed(1)} ms\n${window.top === window ? 'direct' : 'iframe'} | ${mode} | canvas ${court.width}×${court.height} | DPR ${devicePixelRatio}`
        : 'Measuring FPS…';
    }
  }
}

court.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') moveRacket(event);
});
court.addEventListener('pointermove', moveRacket);
court.addEventListener('pointerdown', moveRacket);
for (const type of ['pointerleave', 'pointercancel', 'lostpointercapture']) {
  court.addEventListener(type, event => {
    if (event.pointerType === 'mouse' && !racketIsTouch) setRacket(null);
  });
}
stage.addEventListener('click', event => {
  if (!gamePaused) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
// ---- First game on a phone held on its side (the whole screen is the pad, nothing on screen says so): a short guide on a
// dimmed screen over the court, before the countdown. The countdown waits for it (5 s or SKIP). Upright phones have the
// pad with its own words, and the mouse needs none. ----
const guide = document.querySelector('#guide');
const guideSeconds = 5;
const guideKey = 'oddbirdle-guide-screen';
let guideOpen = false;
let guideHold = false;
let guideFinish;
document.querySelector('#guide-skip')?.addEventListener('click', () => guideFinish?.());
function closeGuide() {
  guideOpen = false;
  guideHold = false;
  if (guide) guide.hidden = true;
}
function guideBeforeCountdown(after) {
  const { sideGuide } = touchLayout({
    coarse: coarsePointer.matches, width: window.innerWidth, height: window.innerHeight, mode, landscapeOnly: sidewaysOnly
  });
  let seen = !sideGuide || testParams.has('test') || !guide;
  try { seen ||= Boolean(localStorage.getItem(guideKey)); } catch { /* not remembered: show it */ }
  if (seen || guideOpen) return after?.();
  try { localStorage.setItem(guideKey, '1'); } catch { /* shown again next visit */ }
  guideOpen = true;
  guideHold = true;
  guide.hidden = false;
  // Restart the 5 s bar.
  const bar = document.querySelector('#guide-bar');
  bar.classList?.remove('run');
  void bar.offsetWidth;
  bar.classList?.add('run');
  const timer = setTimeout(() => guideFinish?.(), guideSeconds * 1000);
  guideFinish = () => {
    if (!guideOpen) return;
    clearTimeout(timer);
    closeGuide();
    // The countdown starts from where it stood.
    lastFrame = undefined;
    accumulator = 0;
    after?.();
  };
}

// Without ONLINE the menu is CPU only: no QUICK MATCH, rooms or codes.
if (!features.online) for (const id of ['#quick', '#create', '#join']) document.querySelector(id).hidden = true;
document.querySelector('#create').addEventListener('click', () =>
  portal === 'gamedistribution' ? afterMatchBreak(() => connect({ type: 'create' })) : connect({ type: 'create' }));
document.querySelector('#join').addEventListener('click', () => {
  setMode('join');
  codeInput.focus();
});
// CPU starts straight away; the level under it is chosen beforehand and remembered.
const cpuLevels = [undefined, 1, 2, 3, 4, 5];
function showCpuLevel() {
  const name = selectedCpuLevel ?? 'RANDOM';
  cpuLevelButton.textContent = 'LV ' + name;
  cpuLevelButton.setAttribute('aria-label', `CPU level: ${String(name).toLowerCase()}. Change level`);
}
try {
  const saved = Number(localStorage.getItem('oddbirdle-cpu-level'));
  if (cpuLevels.includes(saved)) selectedCpuLevel = saved;
} catch {
  // Storage blocked: random level.
}
showCpuLevel();
cpuLevelButton.addEventListener('click', () => {
  selectedCpuLevel = cpuLevels[(cpuLevels.indexOf(selectedCpuLevel) + 1) % cpuLevels.length];
  try {
    localStorage.setItem('oddbirdle-cpu-level', String(selectedCpuLevel ?? 'random'));
  } catch {
    // Remembered for this visit only.
  }
  showCpuLevel();
});
const cardStageIds = new Set([10, 16, 20, 21]);
const cardNames = canShareCard
  ? { ready: 'Share card', posting: 'Preparing…', posted: 'Shared', failed: 'Could not share, try again' }
  : { ready: 'Post card', posting: 'Posting…', posted: 'Posted', failed: 'Could not post, try again' };
function setCardState(state) {
  cardButton.dataset.state = state;
  cardButton.disabled = state === 'posting' || state === 'posted';
  cardButton.setAttribute('aria-label', cardNames[state]);
  cardButton.title = cardNames[state];
  cardLabel.textContent = cardNames[state].toUpperCase();
}

// Posts the full-time card as a comment from inside Reddit (the app's own server does the posting, as the player).
cardButton.addEventListener('click', async () => {
  const view = currentView();
  if (!view?.winner || cardButton.disabled) return;
  const cardStage = selectedStage;
  cardButton.disabled = true;
  setCardState('posting');
  try {
    const summary = matchStats.summary(view);
    const seed = Math.floor(Date.now() / 1000);
    const line = verdictFor(summary, seed);
    const user = redditName();
    const canvas = document.createElement('canvas');
    canvas.width = cardWidth; canvas.height = cardHeight;
    try { await document.fonts.load('650 40px "Space Grotesk"'); } catch { /* the card falls back to the system font */ }
    const dailyCard = cardStage?.daily && dailyResult ? {
      number: cardStage.number, key: cardStage.key, title: cardStage.name, seconds: dailyResult.seconds, attempt: dailyResult.attempt,
      attempts: cardStage.attempts, rank: dailyResult.rank, date: dailyResult.date,
      streak: streakOf([...(dailyState?.calendar ?? []), dailyResult.date], dailyResult.date)
    } : undefined;
    const label = cardStage && !cardStage.daily ? stageLabel(cardStage) : undefined;
    drawCard(canvas.getContext('2d'), { ...summary, palette, stageLabel: label,
      stageName: cardStage?.daily ? undefined : cardStage?.name, daily: dailyCard, line, seed, name: user ? 'u/' + user : '' });
    const text = dailyCard
      ? `DAILY #${dailyCard.number} ${dailyCard.date}: ${dailyCard.title}. CLEARED in ${dailyCard.seconds}s, #${dailyCard.rank} to clear today. ${line}`
      : `FULL-TIME ${summary.mine}:${summary.theirs} vs CPU Lv.${summary.cpuLevel}. ${label ? `${label}: ${cardStage.name}. ` : ''}${line}`;
    if (canShareCard) {
      // The phone app: the share sheet, as often as the player likes.
      const outcome = await shareCardImage({ canvas, text });
      setCardState(outcome === 'failed' ? 'failed' : 'ready');
      cardButton.disabled = false;
      return;
    }
    const response = await fetch('/api/card', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.9), ...(dailyCard ? { daily: true } : { text }) })
    });
    const result = await response.json();
    setCardState(result.ok || result.posted ? 'posted' : 'failed');
    cardButton.disabled = !!(result.ok || result.posted);
    if ((result.ok || result.posted) && dailyCard && dailyState) { dailyState.cardPosted = true; renderTeaser(); }
  } catch {
    setCardState('failed');
    cardButton.disabled = false;
  }
});

// Shows YOU over the player's half for a moment as a match starts.
let youFlagTimer;
function flagYou() {
  if (duo) return;
  touchEnd();
  touchRacket = undefined;
  youFlag.dataset.side = shownSide();
  youFlag.hidden = true;
  // Re-adding it restarts the fade.
  void youFlag.offsetWidth;
  youFlag.hidden = false;
  clearTimeout(youFlagTimer);
  youFlagTimer = setTimeout(() => { youFlag.hidden = true; }, 1800);
}

// Each CPU match puts the player on a random side (the ?test= pages keep the left).
function restartCpu() {
  stands = undefined; // a new crowd for the new match, sized for the stage
  if (duo) {
    // Two people: no CPU, no mirroring, each stays on their own side for every match (so nobody has to swap seats).
    cpuMirrored = false;
    setMirroredShapes(false);
    duoTouch.reset();
    solo = duoGame;
    duoGame.restart(3, undefined, null, { touchLimit: threeTouchLimit });
    // Both rackets are on court from the start (each is moved by its own finger afterwards).
    for (const side of ['left', 'right']) duoGame.moveRacket(side, { ...duoTouch.down(-1, side === 'left' ? 0 : window.innerWidth, 0).racket, time: performance.now() });
    duoTouch.up(-1);
    return;
  }
  cpuMirrored = !testParams.has('test') && Math.random() < 0.5;
  // Before the restart, so the first serve's outline is already built for this court.
  setMirroredShapes(cpuMirrored);
  const rules = selectedStage?.rules;
  const touchLimit = (portal === 'reddit' || portal === 'app') && !selectedStage?.daily ? threeTouchLimit : undefined;
  solo = rules?.twinShuttles ? createTwinShuttleGame() : singles;
  solo.restart(3, rules?.cpuLevel ?? selectedCpuLevel, rules ?? null, { touchLimit });
}

function startCpu({ duo: twoPlayers = false } = {}) {
  duo = twoPlayers;
  matchStats.reset();
  restartCpu();
  accumulator = 0;
  setMode('solo');
  if (selectedStage) showStageIntro();
  else flagYou();
  finishedNoted = false;
  if (!duo) track('game_start', { mode: 'cpu', level: String(selectedCpuLevel ?? 'random') });
}
// 2 PLAYERS: the phone app only.
const duoButton = document.querySelector('#duo');
if (portal === 'app') {
  duoButton.hidden = false;
  duoButton.addEventListener('click', () => afterMatchBreak(() => {
    selectedStage = undefined;
    startCpu({ duo: true });
  }));
}
document.querySelector('#cpu').addEventListener('click', () => afterMatchBreak(() => {
  selectedStage = undefined;
  startCpu();
  guideBeforeCountdown();
}));

// What a stage is played to, said plainly: "FIRST TO 5", and the head start (or deficit) when there is one.
const goalText = challenge => {
  const { points, startScore } = challenge.rules;
  const behind = startScore && startScore.right > startScore.left ? ` · YOU START ${startScore.left}:${startScore.right}` : '';
  return `FIRST TO ${points}${behind}`;
};

// Stage UI is exclusive to Reddit. Random CPU matches remain available as practice.
const stageLabel = challenge => challenge.hidden ? 'SECRET STAGE' : 'STAGE ' + challenge.id;
let stageProgress;
function renderStages(cleared, online) {
  if (!stagesOn) return;
  const done = cleared.filter(id => id <= 20).length;
  stageCount.textContent = `${done}/20`;
  stageBar.style.width = `${done * 5}%`;
  stageProgressLabel.textContent = 'cleared';
  stageScore.title = online ? 'Saved to Reddit' : 'Saved on this device only';
  const buttons = visibleStages(cleared).map(challenge => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stageId = challenge.id;
    const top = document.createElement('span'); top.className = 'stage-top';
    const number = document.createElement('span');
    number.className = challenge.hidden ? 'stage-number stage-secret' : 'stage-number';
    number.textContent = challenge.hidden ? stageLabel(challenge) : String(challenge.id).padStart(2, '0');
    const check = document.createElement('span'); check.className = 'stage-check';
    check.textContent = cleared.includes(challenge.id) ? '✓' : '';
    top.append(number, check);
    if (cleared.includes(challenge.id)) button.dataset.cleared = '';
    if (challenge.boss) {
      button.dataset.boss = '';
      const tag = document.createElement('span'); tag.className = 'stage-boss'; tag.textContent = 'BOSS';
      top.insertBefore(tag, check);
    }
    const copy = document.createElement('span'); copy.className = 'stage-copy';
    const name = document.createElement('strong'); name.textContent = challenge.name;
    const description = document.createElement('span'); description.textContent = challenge.description;
    const goal = document.createElement('span'); goal.className = 'stage-goal'; goal.textContent = goalText(challenge).replace('YOU START', 'START');
    copy.append(name, description, goal);
    button.setAttribute('aria-label', `${stageLabel(challenge)}: ${challenge.name}. ${challenge.description} ${goalText(challenge).toLowerCase()}.${cleared.includes(challenge.id) ? ' Cleared.' : ''}`);
    button.append(top, copy);
    button.addEventListener('click', () => afterMatchBreak(() => {
      selectedStage = challenge;
      startCpu();
    }));
    return button;
  });
  const focused = document.activeElement?.dataset?.stageId;
  const scroll = stageList.scrollTop;
  stageList.replaceChildren(...buttons);
  stageList.scrollTop = scroll;
  if (focused) stageList.querySelector(`[data-stage-id="${focused}"]`)?.focus({ preventScroll: true });
  requestAnimationFrame(updateStageArrows);
}
// The stage that follows `challenge` among those the player can see (the hidden one appears once every other is cleared).
function nextStageAfter(challenge) {
  return visibleStages(stageProgress?.cleared ?? []).find(candidate => candidate.id > challenge.id);
}
nextStageButton.addEventListener('click', () => {
  const following = selectedStage && nextStageAfter(selectedStage);
  if (!following) return;
  afterMatchBreak(() => { selectedStage = following; startCpu(); });
});
function showStageIntro() {
  soundCues.reset();
  stageIntroRemaining = 1.8;
  stageIntroNumber.textContent = selectedStage.daily ? `DAILY #${selectedStage.number} · TRY ${selectedStage.tryNumber}/${selectedStage.attempts}` : stageLabel(selectedStage);
  stageIntroName.textContent = selectedStage.name;
  stageIntroDescription.textContent = selectedStage.rules.doubles ? 'Take turns hitting with your partner.' : selectedStage.description;
  stageIntroGoal.textContent = goalText(selectedStage);
  stageIntro.hidden = false;
  youFlag.hidden = true;
}
function openStages() {
  leave();
  setMode('stages');
  stageList.querySelector('button')?.focus({ preventScroll: true });
  requestAnimationFrame(updateStageArrows);
}
// The cards slide sideways: arrow buttons (shown only where there is more to see), and the mouse wheel for desktop.
const stagePrev = document.querySelector('#stage-prev');
const stageNext = document.querySelector('#stage-next');
function updateStageArrows() {
  const max = stageList.scrollWidth - stageList.clientWidth;
  stagePrev.disabled = stageList.scrollLeft < 4;
  stageNext.disabled = stageList.scrollLeft > max - 4;
}
stageList.addEventListener('scroll', updateStageArrows, { passive: true });
stagePrev.addEventListener('click', () => stageList.scrollBy({ left: -stageList.clientWidth * 0.85, behavior: 'smooth' }));
stageNext.addEventListener('click', () => stageList.scrollBy({ left: stageList.clientWidth * 0.85, behavior: 'smooth' }));
// The mouse wheel slides the cards: one card column per notch, smoothly (a free scroll, so nothing snaps back).
let wheelAt = 0;
stageList.addEventListener('wheel', event => {
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  const now = performance.now();
  if (now - wheelAt < 120) return;
  wheelAt = now;
  const column = stageList.querySelector('button')?.getBoundingClientRect().width ?? 150;
  stageList.scrollBy({ left: Math.sign(delta) * (column + 6) * (Math.abs(delta) > 200 ? 2 : 1), behavior: 'smooth' });
}, { passive: false });
// ---- Daily challenge (Reddit): the server says what today's challenge is and keeps the tries and the clear. ----
// In the phone app the daily calls go to the app server, as the signed-in player (app-account.js).
let appAccount;
let appAccountReady;
const dailyClient = createDailyClient(portal === 'app'
  ? { request: (...args) => appAccountReady.then(account => account.daily(...args)) }
  : undefined);
const dailyEl = id => document.querySelector('#' + id);
let dailyState;       // the server's answer for today: { plan, attemptsUsed, cleared?, calendar }
let dailyToken;       // the try in progress
let dailyResult;      // the clear this try earned (from the server)
let dailyPending = false;
let dailyMessage = '';
let dailyReady = false; // set once the daily block below has run
let dailyCardPosting = false;
let dailyCardPosted = false;

const dailyTriesLeft = () => dailyState ? Math.max(0, dailyState.plan.attempts - dailyState.attemptsUsed) : 0;
function dailyCanRetry() {
  return !dailyPending && !dailyResult && !dailyState?.cleared && dailyTriesLeft() > 0;
}

// The main menu's daily card: today's challenge, the tries left, the first five to clear it, and one button.
// The run of days cleared in a row: through today once today is cleared, otherwise through yesterday (still alive).
function currentStreak(state) {
  const calendar = state.calendar ?? [];
  if (state.cleared) return streakOf(calendar, state.plan.date);
  const yesterday = new Date(state.plan.date + 'T00:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return streakOf(calendar, yesterday.toISOString().slice(0, 10));
}

function renderTeaser() {
  const state = dailyState;
  const button = dailyButton;
  dailyEl('teaser-day').textContent = state ? `DAILY #${state.plan.number} · ${dayLabel(state.plan.date)}` : 'DAILY';
  dailyEl('teaser-title').textContent = state ? playableDaily(state.plan).name : (dailyMessage || '…');
  dailyEl('teaser-rule').textContent = state ? `${goalText(playableDaily(state.plan))} · CPU LV.${state.plan.cpuLevel}` : '';
  const left = dailyTriesLeft();
  const streak = state ? currentStreak(state) : 0;
  dailyEl('teaser-streak').textContent = streak >= 2 ? `${streak}-DAY STREAK` : '';
  dailyEl('teaser-streak').hidden = streak < 2;
  dailyEl('teaser-tries').textContent = !state ? '' : (state.cleared ? 'CLEARED ✓' : left === 0 ? 'NO TRIES LEFT' : `${left} ${left === 1 ? 'TRY' : 'TRIES'} LEFT`);
  const board = state?.board ?? [];
  dailyEl('teaser-board').replaceChildren(...Array.from({ length: 5 }, (_, index) => {
    const entry = board.find(item => item.rank === index + 1);
    const li = document.createElement('li');
    const place = document.createElement('span'); place.className = 'place'; place.textContent = '#' + (index + 1);
    const who = document.createElement('span'); who.className = 'who'; who.textContent = entry ? (portal === 'app' ? entry.name : 'u/' + entry.name) : (index === 0 && state ? 'be the first' : '—');
    const time = document.createElement('span'); time.className = 'time'; time.textContent = entry ? entry.seconds + 's' : '';
    if (!entry) li.dataset.empty = '';
    li.append(place, who, time);
    if (portal === 'app' && entry && state.cleared?.rank !== entry.rank) {
      // Anyone's name can be reported (three reports from different players take a nickname down).
      const flag = document.createElement('button');
      flag.type = 'button';
      flag.className = 'flag';
      flag.textContent = '⚑';
      flag.setAttribute('aria-label', 'Report ' + entry.name);
      flag.addEventListener('click', async () => {
        flag.disabled = true;
        const answer = await appAccount.report(state.plan.date, entry.rank);
        showNotice(answer.ok ? 'REPORTED' : 'COULD NOT REPORT');
      });
      li.append(flag);
    }
    return li;
  }));
  if (portal === 'app') dailyEl('account-name').textContent = appAccount?.profile?.name ?? 'ACCOUNT';
  const icon = dailyEl('daily-icon'), label = dailyEl('daily-label');
  icon.hidden = true;
  if (!state) { label.textContent = 'CHALLENGE'; button.disabled = true; }
  else if (state.cleared) {
    // Today is cleared: the button posts the card of that clear.
    icon.hidden = false;
    // In the app the card is shared as often as the player likes; on Reddit it is posted once.
    const posted = !canShareCard && (dailyCardPosted || state.cardPosted);
    label.textContent = canShareCard ? (dailyCardPosting ? 'PREPARING…' : 'SHARE CARD') : posted ? 'POSTED ✓' : dailyCardPosting ? 'POSTING…' : 'POST CARD';
    button.disabled = posted || dailyCardPosting;
  } else if (left === 0) { label.textContent = 'NO TRIES LEFT'; button.disabled = true; }
  else { label.textContent = 'CHALLENGE'; button.disabled = dailyPending; }
}
const renderDaily = renderTeaser;

// The button: start a try right away, or (today already cleared) post the card of the clear.
function onChallenge() {
  if (!dailyState) { refreshDaily(); return; }
  if (dailyState?.cleared) postDailyPanelCard();
  else startDaily();
}

async function refreshDaily() {
  const before = dailyState?.plan.date;
  dailyState = await dailyClient.today();
  if (dailyState && before && before !== dailyState.plan.date) { dailyCardPosted = false; dailyCardPosting = false; }
  if (!dailyState) dailyMessage = 'Daily unavailable';
  else dailyMessage = '';
  renderTeaser();
}

async function startDaily() {
  if (dailyPending) return;
  dailyPending = true;
  renderTeaser();
  const result = await dailyClient.start();
  dailyPending = false;
  if (!result.ok) {
    dailyMessage = result.reason === 'offline' ? 'Could not connect' : '';
    await refreshDaily();
    return;
  }
  dailyToken = result.token;
  dailyResult = undefined;
  dailyMessage = '';
  const challenge = playableDaily(result.plan);
  afterMatchBreak(() => {
    selectedStage = { ...challenge, id: 'daily', daily: true, tryNumber: result.attempt };
    startCpu();
  });
}

// Tells the server how a daily try ended; the server decides (and times) a clear and gives it its place in the order.
async function reportDailyTry(view, won) {
  const token = dailyToken;
  dailyToken = undefined;
  dailyPending = true;
  recordText = 'SAVING…';
  const answer = token ? await dailyClient.finish(token, { won, mine: view.score.left, theirs: view.score.right }) : { ok: false, reason: 'offline' };
  dailyPending = false;
  if (answer.ok && answer.cleared) {
    dailyResult = answer.record;
    recordText = `DAILY CLEARED · #${answer.record.rank} TO CLEAR`;
    refreshDaily();
  } else if (answer.ok) {
    dailyState = answer.state;
    const left = dailyTriesLeft();
    recordText = left > 0 ? `${left} ${left === 1 ? 'TRY' : 'TRIES'} LEFT` : 'NO TRIES LEFT TODAY';
    renderDaily();
  } else {
    recordText = answer.reason === 'too-fast' ? 'RESULT NOT COUNTED' : 'COULD NOT SAVE THE RESULT';
    refreshDaily();
  }
}

// The card of a clear, posted from the daily panel (a later visit, no live match behind it).
async function postDailyPanelCard() {
  const record = dailyState?.cleared;
  if (!record || dailyCardPosting || (!canShareCard && (dailyCardPosted || dailyState.cardPosted))) return;
  dailyCardPosting = true;
  renderTeaser();
  try {
    const challenge = playableDaily(dailyState.plan);
    const seed = Math.floor(Date.now() / 1000);
    const summary = { won: true, mine: record.mine, theirs: record.theirs, cpuLevel: dailyState.plan.cpuLevel, rally: 0, effects: [] };
    const line = verdictFor(summary, seed);
    const user = redditName();
    const canvas = document.createElement('canvas');
    canvas.width = cardWidth; canvas.height = cardHeight;
    try { await document.fonts.load('650 40px "Space Grotesk"'); } catch { /* system font */ }
    const daily = { number: challenge.number, key: challenge.key, title: challenge.name, seconds: record.seconds, attempt: record.attempt,
      attempts: challenge.attempts, rank: record.rank, date: record.date,
      streak: streakOf([...(dailyState.calendar ?? []), record.date], record.date) };
    drawCard(canvas.getContext('2d'), { ...summary, palette, daily, line, seed, name: user ? 'u/' + user : '' });
    if (canShareCard) {
      await shareCardImage({ canvas, text: `DAILY #${daily.number} ${daily.date}: ${daily.title}. CLEARED in ${daily.seconds}s, #${daily.rank} to clear today. ${line}` });
      dailyCardPosting = false;
      renderTeaser();
      return;
    }
    const response = await fetch('/api/card', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.9), daily: true }) });
    const result = await response.json();
    // 'posted' (409): the server already has a card for this clear, so it is done either way.
    dailyCardPosted = !!result.ok || !!result.posted;
  } catch {
    dailyCardPosted = false;
  }
  dailyCardPosting = false;
  renderTeaser();
}

if (portal === 'reddit') {
  layoutPad();
  dailyEl('daily-teaser').hidden = false;
  dailyButton.addEventListener('click', onChallenge);
  dailyReady = true;
  refreshDaily();
  stagesButton.hidden = false;
  document.querySelector('#cpu').textContent = 'FREE PLAY';
  stageProgress = createStageProgress({ storage, identity: redditIdentity(), onChange: renderStages });
  renderStages([], false);
  stagesButton.addEventListener('click', openStages);
  resultStagesButton.addEventListener('click', () => { if (selectedStage?.daily) leave(); else openStages(); });
}

// ---- The phone app's account screen and its link to the daily card (app-account.js; docs/APP-API.md) -------------------
const accountText = {
  'nickname-invalid': 'Use 3 to 16 letters, numbers, _ or -.',
  'nickname-banned': 'That name is not allowed.',
  'nickname-taken-today': 'You can change your nickname once a day.',
  'nickname-locked': 'Your nickname was taken down after reports.',
  'login-required': 'Sign in first.',
  offline: 'No connection.',
  unavailable: 'Not available on this phone.',
  failed: 'Sign-in did not work. Try again.',
  'already-signed-in': 'Sign out first to use another account.',
  'bad-token': 'The sign-in could not be checked. Try again.',
  'bad-nonce': 'The sign-in took too long. Try again.'
};
let deleteArmed;

async function renderAccount() {
  const profile = (await appAccount.me()) ?? appAccount.profile;
  const providers = appAccount.providers();
  byId('ac-name').textContent = profile?.name ?? '…';
  byId('ac-status').textContent = !profile ? 'No connection.' : profile.account ? 'Signed in' : 'Playing as a guest';
  byId('ac-signin').hidden = !profile || profile.account || !providers.length;
  byId('ac-apple').hidden = !providers.includes('apple');
  byId('ac-google').hidden = !providers.includes('google');
  byId('ac-nick').hidden = !profile?.account || profile.nicknameLocked;
  byId('ac-nick').textContent = profile?.nickname ? 'CHANGE NICKNAME' : 'SET NICKNAME';
  byId('ac-signout').hidden = !profile?.account;
  const cleared = dailyState?.calendar?.length ?? 0;
  const streak = dailyState ? currentStreak(dailyState) : 0;
  byId('ac-clears').textContent = `${cleared} ${cleared === 1 ? 'CLEAR' : 'CLEARS'}`;
  byId('ac-streak').textContent = `${streak}-DAY STREAK`;
  byId('ac-stats').hidden = !dailyState;
  byId('account-name').textContent = profile?.name ?? 'ACCOUNT';
}

function openAccount() {
  setMode('account');
  byId('ac-message').textContent = '';
  deleteArmed = undefined;
  byId('ac-delete').textContent = 'DELETE MY DATA';
  renderAccount();
}

function initAppAccount(storage) {
  const platform = window.Capacitor?.getPlatform?.() ?? 'web';
  appAccount = createAccount({ base: serverBase, storage, plugins: window.Capacitor?.Plugins, platform });
  const say = text => { byId('ac-message').textContent = text; };
  // The daily card sits on the menu, with the first five to clear it; the account is one tap away from it.
  byId('daily-teaser').hidden = false;
  byId('teaser-account').hidden = false;
  dailyButton.addEventListener('click', onChallenge);
  byId('teaser-account').addEventListener('click', openAccount);
  dailyReady = true;
  appAccount.me().then(() => refreshDaily());
  for (const provider of ['apple', 'google']) {
    byId('ac-' + provider).addEventListener('click', async () => {
      say('Signing in…');
      const answer = await appAccount.signIn(provider);
      if (answer.ok) {
        say(answer.merged ? 'Signed in. Records from this phone were added to your account.' : 'Signed in.');
        refreshDaily();
      } else if (answer.reason === 'cancelled') say('');
      else say(accountText[answer.reason] ?? 'Sign-in did not work. Try again.');
      renderAccount();
    });
  }
  // The nickname is typed in the phone's own dialog: the game page switches off text editing for itself (so that holding a
  // finger on a word never brings up the selection loupe), and a native box is also the same on every phone.
  byId('ac-nick').addEventListener('click', async () => {
    const dialog = window.Capacitor?.Plugins?.Dialog;
    let value;
    try {
      const answer = dialog
        ? await dialog.prompt({ title: 'Nickname', message: '3 to 16 letters, numbers, _ or -', inputText: appAccount.profile?.nickname ?? '',
          okButtonTitle: 'Save', cancelButtonTitle: 'Cancel' })
        : { cancelled: false, value: window.prompt('Nickname (3 to 16 letters, numbers, _ or -)', appAccount.profile?.nickname ?? '') };
      if (answer.cancelled || answer.value == null) return;
      value = answer.value;
    } catch {
      return;
    }
    const result = await appAccount.setNickname(value);
    say(result.ok ? 'Saved.' : accountText[result.reason] ?? 'Could not save.');
    renderAccount();
    refreshDaily();
  });
  byId('ac-signout').addEventListener('click', async () => {
    await appAccount.signOut();
    say('Signed out.');
    dailyState = undefined;
    renderAccount();
    refreshDaily();
  });
  byId('ac-code').addEventListener('click', async () => {
    const code = await appAccount.deleteCode();
    say(code ? `Your delete code: ${code}\nKeep it. Entering it at oddbirdle.pages.dev/delete erases your data, even after you remove the app.` : accountText.offline);
  });
  byId('ac-delete').addEventListener('click', async () => {
    if (!deleteArmed) {
      deleteArmed = setTimeout(() => { deleteArmed = undefined; byId('ac-delete').textContent = 'DELETE MY DATA'; }, 6000);
      byId('ac-delete').textContent = 'TAP AGAIN TO ERASE EVERYTHING';
      say('This erases your daily record, nickname and account. It cannot be undone.');
      return;
    }
    clearTimeout(deleteArmed);
    deleteArmed = undefined;
    byId('ac-delete').textContent = 'DELETE MY DATA';
    const answer = await appAccount.deleteMe();
    say(answer.ok ? 'Your data was deleted.' : accountText[answer.reason] ?? 'Could not delete right now.');
    dailyState = undefined;
    renderAccount();
  });
  return appAccount;
}

// The phone app: the same stage list, saved on the device only (no account, no server).
if (portal === 'app' && features.stages) {
  stagesButton.hidden = false;
  document.querySelector('#cpu').textContent = 'FREE PLAY';
  appAccountReady = createAppStorage().then(appStorage => {
    // Nothing is sent anywhere: the request below always fails, so the clears stay on this device.
    stageProgress = createStageProgress({ storage: appStorage, request: () => Promise.reject(new Error('device only')), onChange: renderStages });
    renderStages([], false);
    const savedGain = Number(appStorage.getItem(touchGainKey));
    if (savedGain >= 0.8 && savedGain <= 3) { touchGain = savedGain; showTouchGain(); }
    deviceStorage = appStorage;
    return features.daily ? initAppAccount(appStorage) : undefined;
  });
  stagesButton.addEventListener('click', openStages);
  resultStagesButton.addEventListener('click', () => { if (selectedStage?.daily) leave(); else openStages(); });
}


// Declared before the test pages below, which start a CPU game (and so read it) while the file is still loading.
const quick = { on: false, queued: false, found: undefined, finished: false };

if (testThreeTouches) {
  selectedCpuLevel = 4;
  showCpuLevel();
  window.oddBirdleTest = { solo };
  startCpu();
}

if (testEffects) {
  // A CPU Lv.4 match straight away, with a button (or number key 1-7) per effect.
  selectedCpuLevel = 4;
  showCpuLevel();
  // For scripted checks (screenshots, swings) of this test page only.
  window.oddBirdleTest = { solo };
  const panel = document.createElement('div');
  panel.id = 'effect-test';
  panel.style.cssText = 'position:fixed;left:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:70vw;' +
    'font:12px "Space Grotesk",system-ui,sans-serif;z-index:5';
  const note = document.createElement('span');
  note.style.cssText = 'color:var(--court);align-self:center;margin-left:6px';
  const labels = ['SHOCK', 'INVISIBLE', 'GUST', 'BALLOON', 'FREEZE', 'HIGH NET', 'LOW NET'];
  const trigger = index => {
    const started = mode === 'solo' && solo.triggerEffect(effectIds[index]);
    note.textContent = started ? labels[index] : 'wait for a live rally';
  };
  // The three trial effects (keys 8, 9, 0): not in the live random pool.
  const triggerTrial = index => {
    const started = mode === 'solo' && solo.triggerEffect(trialEffectIds[index]);
    note.textContent = started ? trialEffectLabels[index] : 'wait for a live rally';
  };
  trialEffectIds.forEach((id, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index === 2 ? 0 : index + 8} ${trialEffectLabels[index]}`;
    button.dataset.trial = id;
    button.style.cssText = 'padding:6px 8px;border:0;background:var(--court);color:var(--ink);cursor:pointer;font:inherit;outline:2px dashed var(--ink)';
    button.addEventListener('click', () => triggerTrial(index));
    panel.append(button);
  });
  effectIds.forEach((id, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1} ${labels[index]}`;
    button.style.cssText = 'padding:6px 8px;border:0;background:var(--court);color:var(--ink);cursor:pointer;font:inherit';
    button.addEventListener('click', () => trigger(index));
    panel.append(button);
  });
  // Net sizes to compare: choosing one sets it for HIGH/LOW NET from now on and starts the effect.
  const sizes = [['highNet', 5, [1.6, 2, 2.2]], ['lowNet', 6, [0.5, 0.4, 0.3]]];
  const chosen = { highNet: 2, lowNet: 0.3 };
  for (const [id, index, options] of [...sizes].reverse()) {
    const group = document.createElement('div');
    group.style.cssText = 'display:flex;gap:4px;width:100%';
    const label = document.createElement('span');
    label.textContent = labels[index] + ' size';
    label.style.cssText = 'color:var(--court);align-self:center;min-width:92px';
    group.append(label);
    for (const size of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.net = id;
      button.textContent = `x${size}`;
      button.style.cssText = 'padding:6px 8px;border:0;background:var(--court);color:var(--ink);cursor:pointer;font:inherit';
      button.addEventListener('click', () => {
        solo.setNetScale(id, size);
        for (const other of group.querySelectorAll('button')) other.style.outline = other === button ? '2px solid var(--ink)' : '';
        trigger(index);
        note.textContent = `${labels[index]} x${size}`;
      });
      if (size === chosen[id]) button.style.outline = '2px solid var(--ink)';
      group.append(button);
    }
    panel.prepend(group);
  }
  // How long INVISIBLE lasts: choosing a time sets it from now on and starts the effect.
  const spans = [['invisible', 1, [1, 1.5, 2, 3]]];
  for (const [id, index, options] of spans) {
    const group = document.createElement('div');
    group.style.cssText = 'display:flex;gap:4px;width:100%';
    const label = document.createElement('span');
    label.textContent = labels[index] + ' time';
    label.style.cssText = 'color:var(--court);align-self:center;min-width:92px';
    group.append(label);
    for (const seconds of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.span = id;
      button.textContent = `${seconds}s`;
      button.style.cssText = 'padding:6px 8px;border:0;background:var(--court);color:var(--ink);cursor:pointer;font:inherit';
      button.addEventListener('click', () => {
        solo.setEffectSeconds(id, seconds);
        for (const other of group.querySelectorAll('button')) other.style.outline = other === button ? '2px solid var(--ink)' : '';
        trigger(index);
        note.textContent = `${labels[index]} ${seconds}s`;
      });
      if (seconds === 1) button.style.outline = '2px solid var(--ink)';
      group.append(button);
    }
    panel.prepend(group);
  }
  panel.append(note);
  document.body.append(panel);
  // The panel covers part of the floor, where the lights and their gap are: fold it away with the button or H.
  const foldPanel = document.createElement('button');
  foldPanel.type = 'button';
  foldPanel.style.cssText = 'padding:6px 8px;border:0;background:var(--court);color:var(--ink);cursor:pointer;font:inherit';
  let panelOpen = true;
  const showPanel = () => {
    for (const child of panel.children) if (child !== foldPanel) child.hidden = !panelOpen;
    foldPanel.textContent = panelOpen ? 'FOLD (H)' : 'PANEL \u25b8 (H)';
  };
  foldPanel.addEventListener('click', () => { panelOpen = !panelOpen; showPanel(); foldPanel.blur(); });
  panel.prepend(foldPanel);
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'h') { panelOpen = !panelOpen; showPanel(); }
  });
  showPanel();
  document.addEventListener('keydown', event => {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < effectIds.length) trigger(index);
    if (event.key === '8' || event.key === '9' || event.key === '0') triggerTrial(event.key === '0' ? 2 : Number(event.key) - 8);
  });
  startCpu();
}


// While playing online: measure the round trip (a tiny ping the server echoes) and note how late
// packets are running. Every 2 seconds, or every second with the readout on.
setInterval(() => {
  if (mode !== 'online' || socket?.readyState !== WebSocket.OPEN) return;
  send({ type: 'ping', t: performance.now() });
  netMeter.late(playback.stats.jitterP95);
}, debugNet ? 1000 : 2000);

// ?debug=net: a small readout of how the connection is doing, for checking on a phone.
if (debugNet) {
  const panel = document.createElement('pre');
  panel.id = 'net-debug';
  panel.style.cssText = 'position:fixed;left:4px;top:4px;margin:0;padding:4px 6px;background:rgba(0,0,0,.74);color:#9fe870;' +
    'font:11px/1.35 ui-monospace,Menlo,monospace;z-index:9;pointer-events:none;white-space:pre';
  document.body.append(panel);
  const window10 = 10000;
  let lastStates = 0;
  let lastStatesAt = performance.now();
  let statesPerSecond = 0;
  setInterval(() => {
    const now = performance.now();
    netDebug.rtts = netDebug.rtts.filter(entry => now - entry.at < window10);
    netDebug.frames = netDebug.frames.filter(time => now - time < window10);
    statesPerSecond = (netDebug.states - lastStates) / ((now - lastStatesAt) / 1000);
    lastStates = netDebug.states;
    lastStatesAt = now;
  }, 1000);
  const median = list => list.length ? list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)] : undefined;
  setInterval(() => {
    const now = performance.now();
    const stats = playback.stats;
    const rtts = netDebug.rtts.map(entry => entry.rtt);
    const gaps = netDebug.frames.slice(1).map((time, i) => time - netDebug.frames[i]);
    const inLastSecond = netDebug.frames.filter(time => now - time < 1000).length;
    const link = navigator.connection;
    const round = value => (value === undefined ? '-' : Math.round(value));
    const online = mode === 'online';
    panel.textContent = [
      `${oldNet ? 'OLD net behaviour' : beforeNet ? 'BEFORE (no burst cushion)' : 'new net behaviour'} | mode ${mode} | ${online ? 'ping ' + round(rtts.at(-1)) + 'ms (median ' + round(median(rtts)) + ', worst ' + round(Math.max(...rtts, 0)) + ')' : 'not in an online match'}`,
      online ? `snapshots ${statesPerSecond.toFixed(0)}/s | late p95 ${round(stats.jitterP95)}ms` : '',
      online ? `buffer ${round(stats.bufferMs)}ms | speed ${round(stats.rate * 100)}% | guessed ${(stats.starved / Math.max(1, stats.frames) * 100).toFixed(1)}% of frames` : '',
      `fps ${inLastSecond} | worst frame gap ${round(Math.max(...gaps, 0))}ms | ${racketIsTouch ? 'touch' : 'mouse'} | dpr ${devicePixelRatio}`,
      link ? `network ${link.effectiveType ?? '?'} est. rtt ${link.rtt ?? '?'}ms ${link.downlink ?? '?'}Mbps${link.saveData ? ' save-data' : ''}` : 'network (not reported by this browser)'
    ].filter(Boolean).join('\n');
  }, 250);
}

if (testShapes) {
  // ?test=shapes: a CPU match straight away, with a foldable panel to pin the shuttle's shape and size,
  // pick the CPU level and switch random effects on or off. Pinned choices apply from the next serve.
  selectedCpuLevel = 4;
  showCpuLevel();
  solo.setEffects(false);
  const shapeNames = ['tri', 'circle', 'square', 'bar', 'diamond', 'hex', 'star', '{', 'y', 'o', '}', 'L'];
  const sizeNames = ['S', 'M', 'L'];
  const choice = { shape: undefined, size: undefined, effects: false };
  const box = document.createElement('div');
  box.id = 'shape-test';
  // Its own dark backing so it reads on top of the court; fold it away (button or H) to see everything.
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:min(560px, calc(100vw - 16px));z-index:5;padding:6px;' +
    'background:var(--page);font:12px "Space Grotesk",system-ui,sans-serif;color:var(--court)';
  const fold = document.createElement('button');
  fold.type = 'button';
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:4px';
  const base = 'padding:6px 8px;border:0;cursor:pointer;font:inherit;';
  const paint = (button, on) => {
    button.style.cssText = base + (on ? 'background:var(--court);color:var(--ink)' : 'background:transparent;color:var(--court);outline:1px solid var(--court)');
  };
  const group = (title, options, selected, pick) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center';
    const label = document.createElement('span');
    label.textContent = title;
    label.style.cssText = 'min-width:46px';
    row.append(label);
    const buttons = options.map(([text, value]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      paint(button, selected() === value);
      button.addEventListener('click', () => {
        pick(value);
        buttons.forEach(([other, otherValue]) => paint(other, selected() === otherValue));
      });
      return [button, value];
    });
    buttons.forEach(([button]) => row.append(button));
    body.append(row);
  };
  const apply = () => solo.setShuttle({ shape: choice.shape, size: choice.size });
  group('shape', [['RANDOM', undefined], ...Array.from({ length: shapeCount }, (_, i) => [shapeNames[i] ?? `#${i}`, i])],
    () => choice.shape, value => { choice.shape = value; apply(); });
  group('size', [['RANDOM', undefined], ...shuttleSizeOptions.map((px, i) => [`${sizeNames[i] ?? i} ${px}`, i])],
    () => choice.size, value => { choice.size = value; apply(); });
  group('CPU', [1, 2, 3, 4, 5].map(level => [`Lv${level}`, level]), () => selectedCpuLevel,
    value => { selectedCpuLevel = value; showCpuLevel(); startCpu(); });
  group('effects', [['OFF', false], ['ON', true]], () => choice.effects, value => { choice.effects = value; solo.setEffects(value); });
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.textContent = 'RESTART MATCH';
  paint(restart, true);
  restart.addEventListener('click', () => { startCpu(); restart.blur(); });
  body.append(restart);
  const showPanel = open => {
    body.hidden = !open;
    fold.textContent = open ? 'SHAPES ▾  (H)' : 'SHAPES ▸  (H)';
    paint(fold, true);
  };
  let open = true;
  fold.addEventListener('click', () => { open = !open; showPanel(open); fold.blur(); });
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'h') { open = !open; showPanel(open); }
  });
  showPanel(true);
  box.append(body, fold);
  document.body.append(box);
  startCpu();
}

if (onlyEffectTest) {
  // No panel on screen. Only the chosen effect comes up; &fast=1 makes it come sooner.
  selectedCpuLevel = 4;
  showCpuLevel();
  solo.setOnlyEffect(onlyEffectTest);
  startCpu();
}

// ?test=netcord: a CPU Lv.3 match without effects, and a button (or N) that sends the shuttle from your side at the tape.
if (testParams.get('test') === 'netcord') {
  selectedCpuLevel = 3;
  showCpuLevel();
  solo.setEffects(false);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'N  SHOT AT THE TAPE';
  button.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:5;padding:8px 12px;border:0;cursor:pointer;' +
    'background:var(--court);color:var(--ink);font:650 13px "Space Grotesk",system-ui,sans-serif';
  const note = document.createElement('span');
  note.style.cssText = 'position:fixed;left:8px;bottom:44px;z-index:5;color:var(--court);font:12px "Space Grotesk",system-ui,sans-serif';
  const shoot = () => {
    const sent = mode === 'solo' && solo.testNetCord();
    note.textContent = sent ? '' : 'wait for a live rally';
    button.blur();
  };
  button.addEventListener('click', shoot);
  document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'n' && !event.repeat) shoot(); });
  document.body.append(button, note);
  startCpu();
}

if (testJuice) {
  // A CPU Lv.4 match straight away, with a switch per touch and a reset for the hint and records.
  selectedCpuLevel = 4;
  showCpuLevel();
  const names = ['1 Squash', '2 Dust', '3 Score pop', '4 First hint', '5 First win'];
  const panel = document.createElement('div');
  panel.id = 'juice-test';
  panel.style.cssText = 'position:fixed;left:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 16px);' +
    'font:12px "Space Grotesk",system-ui,sans-serif;z-index:5';
  const style = (button, on) => {
    button.setAttribute('aria-pressed', String(on));
    button.style.cssText = 'padding:6px 8px;border:0;cursor:pointer;font:inherit;' +
      (on ? 'background:var(--court);color:var(--ink)' : 'background:transparent;color:var(--court);text-decoration:line-through;opacity:.6');
  };
  juiceKeys.forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = names[index];
    style(button, juice[key]);
    button.addEventListener('click', () => {
      juice[key] = !juice[key];
      style(button, juice[key]);
    });
    panel.append(button);
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset hint + records';
  reset.style.cssText = 'padding:6px 8px;border:1px solid var(--court);background:transparent;color:var(--court);cursor:pointer;font:inherit';
  reset.addEventListener('click', () => {
    resetJuiceRecords(storage);
    beatenThisVisit.clear();
    Object.assign(hint, { shown: true, fading: undefined });
    recordText = '';
    reset.blur();
  });
  panel.append(reset);
  document.body.append(panel);
  startCpu();
}

// QUICK MATCH: play the CPU right away and wait for another player in the background.
// Only players who are actually here (tab visible, recent input) wait, so a match
// can start straight away with no accept step.
const idleMs = 30000;
let lastInput = performance.now();
for (const type of ['pointermove', 'pointerdown', 'keydown']) {
  document.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true });
}

function showQueueStatus() {
  // Only for the first countdown after a match is found, not for rematches.
  const found = quick.on && mode === 'online' && quick.found !== undefined;
  const looking = quick.on && mode === 'solo';
  const idle = performance.now() - lastInput >= idleMs;
  const lookingText = gamePaused || breakPending ? 'Matchmaking paused' : idle ? 'Move to keep searching…' : 'Looking for a player…';
  queueStatus.hidden = !(found || looking);
  queueStatus.toggleAttribute('data-found', found);
  setText(queueStatus, found ? 'Opponent found!' : looking ? lookingText : '');
}

function updateQueue() {
  const want = !gamePaused && !breakPending && quick.on && mode === 'solo' && document.visibilityState === 'visible' &&
    performance.now() - lastInput < idleMs;
  if (want !== quick.queued && socket?.readyState === WebSocket.OPEN) {
    send({ type: want ? 'queue' : 'unqueue', restartBarrier: coordinatedBreak, touchLimit: want ? threeTouchLimit : undefined });
    if (!want) quick.queued = false;
  }
  showQueueStatus();
}
setInterval(updateQueue, 1000);
document.addEventListener('visibilitychange', updateQueue);

function backToQuick(abortReason) {
  if (abortReason) track('quick_match_abort');
  leave('', true);
  startCpu();
  connect({ type: 'queue' }, 'quick');
}

document.querySelector('#quick').addEventListener('click', () => afterMatchBreak(() => {
  quick.on = true;
  track('quick_match_enter');
  startCpu();
  // Looking for a player starts once the guide (if any) is gone, so nobody is matched while reading it.
  guideBeforeCountdown(() => { if (quick.on && mode === 'solo' && !socket) connect({ type: 'queue' }, 'quick'); });
  showQueueStatus();
}));
joinForm.addEventListener('submit', event => {
  event.preventDefault();
  const code = normalizeRoomCode(codeInput.value);
  if (!code) {
    setMode('join', 'Room not found.');
    codeInput.focus();
    return;
  }
  if (coordinatedBreak) afterMatchBreak(() => connect({ type: 'join', code }));
  else connect({ type: 'join', code });
});
codeInput.addEventListener('input', () => {
  if (mode === 'join' && !socket) setMode('join');
});
// Inside a stage, back returns to the stage cards, not the main menu.
back.addEventListener('click', () => {
  if (stagesOn && mode === 'solo' && selectedStage?.daily) leave();
  else if (stagesOn && mode === 'solo' && selectedStage) openStages();
  else leave();
});

// GamePix has no links out of the game, so there the room code itself is what gets copied.
const copyLabel = canShareCard ? 'SHARE INVITE' : closedPortal ? 'COPY CODE' : 'COPY LINK';
let copyReset;
setText(copyLink, copyLabel);
function showCopyResult(label) {
  setText(copyLink, label);
  clearTimeout(copyReset);
  copyReset = setTimeout(() => setText(copyLink, copyLabel), 1600);
}
copyLink.addEventListener('click', async () => {
  // On a portal, invite links stay on the portal (CrazyGames) or point at our site.
  const link = canShareCard ? inviteUrl(roomCode.value, siteUrl) : portalInviteLink(roomCode.value) ?? roomLink(roomCode.value, portal ? siteUrl : location.href);
  if (canShareCard) {
    // The phone app: the system share sheet, with the room code and a link that opens the game in a browser.
    const outcome = await shareInvite({ text: `Play Odd Birdle with me! Room code: ${roomCode.value}`, url: link });
    if (outcome === 'shared') track('link_copy');
    if (outcome !== 'unavailable') return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showCopyResult('COPIED');
    track('link_copy');
    return;
  } catch {
    // Older or locked-down browsers: fall back to a temporary selection.
  }
  const field = document.createElement('textarea');
  field.value = link;
  field.setAttribute('readonly', '');
  field.className = 'sr-only';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (copied) {
    showCopyResult('COPIED');
    track('link_copy');
  }
  else setMode('waiting', link);
});

// Opening an invite link joins that room straight away, then tidies the address bar.
// CPU pause also withdraws matchmaking. A real online match continues on the
// server; only this client's scene, sound and input pause, with a clear warning.
onPortalPause(paused => {
  if (gamePaused === paused) return;
  gamePaused = paused;
  lastFrame = undefined;
  accumulator = 0;
  if (paused) {
    setRacket(null);
    setPlaying(false);
    if (quick.on && mode === 'solo' && socket) {
      quick.queued = false;
      // Closing also covers a start already in flight: callbacks from this old
      // socket are ignored, so a paused player cannot be moved into a match.
      leave('', true);
    }
  } else {
    resetPrediction();
    if (mode === 'online' && onlineView && Number.isFinite(latestOnlineTime)) {
      playback.reset();
      playback.push(latestOnlineTime, onlineView, performance.now());
    }
    lastInput = performance.now();
    if (quick.on && mode === 'solo' && !socket) connect({ type: 'queue' }, 'quick');
  }
  showPauseState();
  updateQueue();
});

initPortal().then(() => {
  loadingStart();
  const invitedRoom = roomFromLink(location.href) ?? normalizeRoomCode(portalInviteRoom());
  if (invitedRoom) {
    if (!portal) history.replaceState(null, '', location.pathname);
    codeInput.value = invitedRoom;
    if (coordinatedBreak) setMode('join');
    else connect({ type: 'join', code: invitedRoom }, 'link');
  } else if (isInstantMultiplayer()) {
    // A CrazyGames party leader: skip the menu and open a room to invite friends into.
    connect({ type: 'create' });
  }
  // An invite accepted while already in the game: leave whatever is going on and join.
  onJoinRoom(code => {
    const room = normalizeRoomCode(code);
    if (!room) return;
    if (socket) leave();
    codeInput.value = room;
    connect({ type: 'join', code: room }, 'link');
  });
  sound.setPortalMuted(portalMuted());
  onPortalMute(muted => {
    sound.setPortalMuted(muted);
    showSoundState();
  });
  showSoundState();
  loadingStop();
});
// The app (Android, iOS): the back button (Android only), and pausing while the app is in the background (app-shell.js).
if (portal === 'app') {
  import('./app-shell.js').then(({ startAppShell }) => startAppShell({
    state: () => ({ mode, phase: currentView().phase, guideOpen }),
    setPaused: setAppPaused,
    toMenu: () => leave(),
    wakeAudio: () => sound.wake(),
    sleepAudio: () => sound.sleep()
  })).catch(error => console.error('Odd Birdle app shell failed', error));
  // An invite link opened with the app installed (the site's /join/CODE address): straight into that room.
  const openInvite = url => {
    const room = roomFromInvite(url);
    if (!room || !features.online) return;
    if (socket) leave();
    codeInput.value = room;
    connect({ type: 'join', code: room }, 'link');
  };
  try {
    const appPlugin = window.Capacitor?.Plugins?.App;
    appPlugin?.addListener?.('appUrlOpen', event => openInvite(event?.url));
    // The app was not running: the link that started it.
    appPlugin?.getLaunchUrl?.()?.then?.(launch => { if (launch?.url) setTimeout(() => openInvite(launch.url), 600); }).catch?.(() => {});
  } catch { /* no App plugin in a browser preview */ }
}
trackVisit();
startHeartbeat(() => mode === 'solo' ? 'cpu' : mode === 'online' ? 'online' : 'menu');

// Sound can only start from a click, tap or key press.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => sound.unlock(), { capture: true });
}
function showSoundState() {
  // Shows what is heard: a portal mute shows as muted even if the button was left on.
  soundToggle.setAttribute('aria-pressed', String(!sound.audible));
  const label = sound.portalMuted ? 'Sound muted by the portal' : sound.enabled ? 'Mute sound' : 'Turn sound on';
  soundToggle.setAttribute('aria-label', label);
  soundToggle.title = label;
}
soundToggle.addEventListener('click', () => {
  sound.toggle();
  showSoundState();
});
showSoundState();
// Full screen: the main site's own page only (portals have their own, and an embed frame may not allow it).
if (!portal && fullscreenSupported()) {
  const showFullscreenState = () => {
    const on = Boolean(fullscreenElement());
    document.querySelector('main').toggleAttribute('data-fullscreen', on);
    fullscreenToggle.setAttribute('aria-pressed', String(on));
    fullscreenToggle.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    fullscreenToggle.title = on ? 'Leave full screen' : 'Full screen';
  };
  fullscreenToggle.hidden = false;
  fullscreenToggle.addEventListener('click', () => { toggleFullscreen(document.querySelector('main')); fullscreenToggle.blur(); });
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(type, showFullscreenState);
}
function playAgain() {
  if (gamePaused || breakPending || rematchReady) return;
  // A daily try is a new try on the server (it counts), not a plain restart.
  if (mode === 'solo' && selectedStage?.daily) { startDaily(); return; }
  const rematch = currentView().phase === 'finished' || onlineView?.phase === 'finished';
  const restart = () => {
    if (currentView().phase === 'finished' || onlineView?.phase === 'finished') {
      track('rematch', { mode: mode === 'solo' ? 'cpu' : 'online' });
    }
    finishedNoted = false;
    // Online restarts arrive as a new 'start' message; CPU ones are counted here.
    if (mode === 'solo') track('game_start', { mode: 'cpu', level: selectedCpuLevel ?? 'random' });
    if (mode === 'solo') {
      matchStats.reset();
      restartCpu();
      if (selectedStage) showStageIntro();
      else flagYou();
    }
    else {
      rematchReady = true;
      rematchStatus = 'Waiting for opponent…';
      send({ type: 'restart', round: onlineRound });
    }
  };
  if (rematch) afterMatchBreak(restart, { rematch: true });
  else restart();
}
gameControl.addEventListener('click', playAgain);
playAgainButton.addEventListener('click', playAgain);
toMenuButton.addEventListener('click', () => leave());
// After a match, Enter, Space or R also plays again (not while typing a room code).
document.addEventListener('keydown', event => {
  if (resultActions.hidden || event.repeat || event.target?.closest?.('input, textarea, button')) return;
  if (event.key !== 'Enter' && event.key !== ' ' && event.key.toLowerCase() !== 'r') return;
  event.preventDefault();
  playAgain();
});
resize();
new ResizeObserver(resize).observe(court);
requestAnimationFrame(frame);
