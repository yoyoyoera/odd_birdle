import { center, clamp, createGame, floor, height, leftLine, netTop, racketRadius, rightLine, shuttleOutline, step, width, contactMotion, isSwing, projectStrike, forceAt, effectIds, shapeCount, shuttleSizeOptions, racketTouches, supportedShuttleY, swingMotion } from './game.js';
import { createPlayback, followStrikeClock, legacyTuning } from './playback.js';
import { createRacketSender } from './net-send.js';
import { createNetMeter } from './net-quality.js';
import { normalizeRoomCode, roomFromLink, roomLink } from './room-link.js';
import { createDemo } from './demo.js';
import { startHeartbeat, track, trackVisit } from './analytics.js';
import { createSound } from './sound.js';
import { createCueTracker } from './sound-cues.js';
import {
  createJuiceTracker, dustAt, hintSeen, juiceKeys, juiceTiming, makeDust, markHintSeen, noteCpuWin,
  resetJuiceRecords, squashAmount
} from './juice.js';
import {
  initPortal, isInstantMultiplayer, loadingStart, loadingStop, onJoinRoom, onPortalMute, portal, portalInviteLink,
  portalInviteRoom, portalMuted, roomFull, roomLeft, roomOpen, serverBase, setPlaying, siteUrl
} from './portal.js';

const court = document.querySelector('#court');
const ctx = court.getContext('2d');
const stage = document.querySelector('#stage');
const scoreboard = document.querySelector('#score');
const sideLabel = document.querySelector('#side-label');
const cpuLabel = document.querySelector('#cpu-label');
const winnerLabel = document.querySelector('#winner');
const recordLabel = document.querySelector('#record');
const status = document.querySelector('#status');
const eventBanner = document.querySelector('#event-banner');
const gameControl = document.querySelector('#game-control');
const menu = document.querySelector('#menu');
const cpuLevelButton = document.querySelector('#cpu-level');
const back = document.querySelector('#back');
const roomDisplay = document.querySelector('#room-display');
const roomCode = document.querySelector('#room-code');
const joinForm = document.querySelector('#join-form');
const codeInput = document.querySelector('#code-input');
const lobbyMessage = document.querySelector('#lobby-message');
const queueStatus = document.querySelector('#queue-status');
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
const testParams = new URLSearchParams(location.search);
const testEffects = testParams.get('test') === 'effects';
const testShapes = testParams.get('test') === 'shapes';
const debugNet = testParams.get('debug') === 'net';
// ?net=old: the earlier playback and unbundled touch input, to compare on the same phones.
const oldNet = testParams.get('net') === 'old';
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
const solo = createGame({ withCpu: true, quickEvents: testEffects && testParams.get('fast') === '1' });
const demo = createDemo();
const sound = createSound();
const soundCues = createCueTracker();
const soundToggle = document.querySelector('#sound-toggle');
// Two CPUs rally quietly behind the menus; the court stays still for reduced motion.
// A first-time visitor sees the plain main screen: a silent match running behind the menu would
// look like a game without sound. The demo starts once they have made their first hit.
const demoShowing = () => mode !== 'solo' && mode !== 'online' && !reduceMotion.matches && !hint.shown;
const demoAlpha = { racket: 0.4, bird: 0.75 };
const ready = { phase: 'ready' };
let socket;
let onlineView;
const playback = createPlayback(oldNet ? legacyTuning : {});
let mode = 'menu';
let joinVia = 'create';
let finishedNoted = false;
let selectedCpuLevel;
let localSide = 'left';
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
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setMode(next, message = '') {
  if (next !== mode) soundCues.reset();
  mode = next;
  menu.hidden = next !== 'menu';
  roomDisplay.hidden = next !== 'waiting';
  joinForm.hidden = next !== 'join';
  back.hidden = next === 'menu';
  lobbyMessage.hidden = !message;
  setText(lobbyMessage, message);
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
}

// stay: keep the current screen (quick match going back to its CPU game).
function leave(message = '', stay = false) {
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
  quick.on = false;
  showQueueStatus();
  setMode('menu', message);
}

function connect(request, via = request.type === 'join' ? 'code' : 'create') {
  const join = request.type === 'join';
  const queueing = request.type === 'queue';
  if (socket) return;
  joinVia = via;
  // Quick match connects quietly while the CPU game keeps going.
  if (!queueing) setMode(join ? 'join' : 'connecting');
  quick.queued = false;
  const url = new URL('play', serverBase);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(url);
  socket = connection;
  connection.addEventListener('open', () => {
    if (socket !== connection) return;
    if (queueing) updateQueue();
    else send(request);
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
        if (queueing && mode === 'solo') {
          quick.found = performance.now();
          quick.finished = false;
          track('quick_match_found');
        }
        quick.queued = false;
        localSide = message.side;
        localRacket = undefined;
        onlineView = message.state;
        playback.reset();
        netMeter.begin();
        resetPrediction();
        playback.push(message.time, message.state, performance.now());
        setMode('online');
        finishedNoted = false;
        roomFull(message.code ?? request.code ?? roomCode.value);
        track('game_start', { mode: 'online', via: queueing ? 'quick' : joinVia });
        showQueueStatus();
        break;
      case 'state':
        netDebug.states++;
        onlineView = message.state;
        playback.push(message.time, message.state, performance.now());
        break;
      case 'pong':
        if (Number.isFinite(message.t)) {
          const now = performance.now();
          netMeter.rtt(now - message.t);
          if (debugNet) netDebug.rtts.push({ at: now, rtt: now - message.t });
        }
        break;
      case 'error':
        leave();
        setMode(join ? 'join' : 'menu', message.message);
        if (join) codeInput.focus();
        break;
      case 'left':
        // A quick-match opponent leaving just sends you back to the CPU game and the queue.
        if (queueing) backToQuick(quick.finished ? undefined : 'opponent left');
        else leave('Opponent left.');
        break;
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    const wasPlaying = mode === 'online';
    if (queueing) {
      if (wasPlaying) backToQuick(quick.finished ? undefined : 'connection lost');
      else {
        // Waiting connection dropped: keep playing the CPU and try again shortly.
        leave('', true);
        quick.queued = false;
        showQueueStatus();
        setTimeout(() => { if (quick.on && !socket) connect({ type: 'queue' }, 'quick'); }, 5000);
      }
      return;
    }
    leave(wasPlaying ? 'Connection lost.' : 'Could not connect.');
  });
}

function updateHud(view) {
  const { phase, score, eventText = '', eventWind = false, winner, message = '' } = view;
  if (stage.dataset.phase !== phase) stage.dataset.phase = phase;
  scoreboard.hidden = !score;
  sideLabel.hidden = mode !== 'online' && mode !== 'solo';
  sideLabel.dataset.side = mode === 'solo' ? 'left' : localSide;
  cpuLabel.hidden = mode !== 'solo' || !view.cpuLevel;
  setText(cpuLabel, view.cpuLevel ? 'CPU Lv. ' + view.cpuLevel : '');
  if (score) {
    const value = score.left + ':' + score.right;
    if (scoreboard.value !== value) scoreboard.value = value;
  }
  winnerLabel.hidden = !winner;
  setText(winnerLabel, winner ? (winner === localSide ? 'You Win!' : 'You Lose..') : '');
  if (phase !== 'finished') recordNoted = false;
  const record = phase === 'finished' && juice.record ? recordText : '';
  recordLabel.hidden = !record;
  setText(recordLabel, record);
  setText(status, message);
  eventBanner.hidden = !eventText;
  eventBanner.toggleAttribute('data-wind', eventWind);
  setText(eventBanner, eventText);
  gameControl.hidden = mode !== 'solo' && !(mode === 'online' && phase === 'finished');
}

// Counts each match that reaches its final point once.
function noteFinish(view) {
  if ((mode !== 'solo' && mode !== 'online') || view.phase !== 'finished' || finishedNoted || !view.winner) return;
  finishedNoted = true;
  if (mode === 'online') reportNet();
  const result = view.winner === (mode === 'solo' ? 'left' : localSide) ? 'win' : 'lose';
  noteRecord(view, result);
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
  if (!shuttle.canHit || prediction || predictedFlight === shuttle.flight ||
      (!overlaps && !racketTouches(shuttle, from, to))) return false;
  localOverlap = overlaps;
  predictedFlight = shuttle.flight;
  // A wind or balloon in progress shapes the flight the same way on the server.
  prediction = { shuttle, motion, started: time, force: onlineView?.force };
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
  if (mode === 'solo') solo.moveRacket('left', input);
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
    racketSender.push({ type: 'racket', input, seenTime: playback.displayedTime });
  }
}

function moveRacket(event) {
  const phase = currentView().phase;
  if ((phase !== 'live' && phase !== 'between' && phase !== 'starting') || !event.isPrimary ||
      (event.pointerType !== 'mouse' && event.buttons === 0)) return;
  const bounds = court.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * width / bounds.width;
  racketIsTouch = event.pointerType !== 'mouse';
  setRacket({
    x: localSide === 'left' ? clamp(x, 0, center - racketRadius) : clamp(x, center + racketRadius, width),
    y: clamp((event.clientY - bounds.top) * height / bounds.height, 0, floor),
    time: event.timeStamp
  });
}

function drawRacket(position, fill, stroke, side) {
  ctx.beginPath();
  const squash = squashes[side];
  const amount = squash && juice.squash && !reduceMotion.matches ? squashAmount(performance.now() - squash.start) : 0;
  // Squash: a little flatter along the way the shuttle was sent, a little wider across it.
  if (amount) ctx.ellipse(position.x, position.y, racketRadius * (1 - amount), racketRadius * (1 + amount * 0.6), squash.angle, 0, Math.PI * 2);
  else ctx.arc(position.x, position.y, racketRadius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawCourt(view) {
  const top = view.netTop ?? netTop;
  ctx.fillStyle = palette.court;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, floor, width, height - floor);
  drawLamps(view.shadow);
  ctx.fillStyle = palette.line;
  ctx.fillRect(leftLine, floor, rightLine - leftLine, 8);

  ctx.fillStyle = palette.net;
  ctx.fillRect(center - 2, top, 4, floor - top);
  ctx.fillRect(center - 9, top, 18, 4);
  ctx.fillStyle = '#f7f6e9';
  for (const x of [leftLine, center, rightLine]) ctx.fillRect(x - 2, floor, 4, 8);
}

function draw(view, scenery = false) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (view.shake && !reduceMotion.matches) {
    const t = view.shake;
    ctx.translate(Math.sin(t * 91) * 17 * t, Math.cos(t * 117) * 12 * t);
  }
  drawCourt(view);
  if (view.force?.type === 'wind') drawWind(view.force);
  if (view.phase !== 'ready') {
    if (scenery) ctx.globalAlpha = demoAlpha.racket;
    const other = localSide === 'left' ? 'right' : 'left';
    if (view[other]) drawRacket(view[other], '#cf936b99', '#774935', scenery ? undefined : other);
    // Online matches draw the locally predicted racket; a quick-match CPU game (which also
    // has a connection open while waiting) draws the game's own racket.
    const ownRacket = mode === 'online' && !scenery ? localRacket : view[localSide];
    if (ownRacket && view.phase !== 'finished') drawRacket(ownRacket, '#a9d67877', palette.ink, scenery ? undefined : localSide);
    if (view.shuttle) drawShuttle(view, scenery ? demoAlpha.bird : 1);
    ctx.globalAlpha = 1;
    if (!scenery) {
      drawDust();
      drawHint(view);
    }
  }
  ctx.restore();
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
  if (!hint.shown || !juice.hint || !['starting', 'live', 'between'].includes(view.phase)) return;
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
  ctx.fillText('Move to hit', localSide === 'left' ? center / 2 : center * 1.5, floor * 0.42);
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

const lampAimedAt = 410;

// The court lights: a spotlight in each top corner shining across the court. Where the shuttle gets in
// the way the beam stops: a dark wedge runs on behind it, away from the lamp. When INVISIBLE hides the
// shuttle, the wedge is still drawn, and its point is where the shuttle is.
function drawLamps(shadow) {
  const lamps = [{ x: 62, y: 80, side: 1 }, { x: width - 62, y: 80, side: -1 }];
  for (const lamp of lamps) {
    const toward = x => lamp.side === 1 ? x : width - x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y);
    ctx.lineTo(toward(137), floor);
    ctx.lineTo(toward(684), floor);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.beginPath();
    ctx.rect(0, 0, width, floor);
    if (shadow) {
      const dx = shadow.x - lamp.x;
      const dy = shadow.y - lamp.y;
      const distance = Math.hypot(dx, dy);
      if (distance > shadow.r + 1) {
        const angle = Math.atan2(dy, dx);
        const spread = Math.asin(Math.min(1, shadow.r / distance));
        const near = Math.sqrt(distance * distance - shadow.r * shadow.r);
        const edge = (turn, length) => ({ x: lamp.x + Math.cos(angle + turn) * length, y: lamp.y + Math.sin(angle + turn) * length });
        const [a1, a2, b1, b2] = [edge(-spread, near), edge(spread, near), edge(-spread, 3000), edge(spread, 3000)];
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.closePath();
      }
    }
    ctx.fill('evenodd');
    ctx.restore();
    const aim = Math.atan2(floor - lamp.y, toward(lampAimedAt) - lamp.x);
    ctx.save();
    ctx.translate(lamp.x - Math.cos(aim) * 4, lamp.y - Math.sin(aim) * 4);
    ctx.rotate(aim + Math.PI / 2);
    ctx.fillStyle = palette.floor;
    ctx.fillRect(-24, -9, 48, 14);
    ctx.restore();
  }
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
  for (const ring of shuttleOutline(shuttle)) {
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
  ctx.fillStyle = phase === 'live' ? palette.ink : palette.net;
  ctx.fill('evenodd');
}

function frame(time) {
  if (debugNet) netDebug.frames.push(time);
  if (mode === 'online') netMeter.frame(time);
  const scenery = demoShowing();
  if ((mode === 'solo' || scenery) && lastFrame !== undefined) {
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
      send({ type: 'hold', seenTime: playback.displayedTime, time });
    }
  }
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
  let drawing = mode === 'online' ? predictedView(view, time) : view;
  if (mode === 'solo' || mode === 'online') {
    for (const cue of soundCues.cues(drawing, time, mode === 'solo' ? 'left' : localSide)) sound.play(cue);
  }
  const pose = drawing.shuttle;
  if (mode === 'online' && !view.frozen && pose && localRacket &&
      (pose.x < center ? 'left' : 'right') === localSide &&
      (view.support === localSide || (localOverlap && localRacket.vy < 0 && !isSwing(localRacket)))) {
    const y = supportedShuttleY(pose, localRacket, localRacket);
    if (y !== undefined) drawing = { ...drawing, shuttle: { ...pose, y } };
  }
  if (mode === 'solo' || mode === 'online') {
    playJuice(juiceTracker.update(drawing, time), time, mode === 'solo' ? 'left' : localSide);
  } else {
    juiceTracker.reset();
  }
  if (scenery) draw(demoView, true);
  else draw(drawing);
  requestAnimationFrame(frame);
}

court.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') moveRacket(event);
});
court.addEventListener('pointermove', moveRacket);
court.addEventListener('pointerdown', moveRacket);
for (const event of ['pointerleave', 'pointercancel', 'lostpointercapture']) {
  court.addEventListener(event, () => setRacket(null));
}
court.addEventListener('pointerup', event => {
  if (event.pointerType !== 'mouse') setRacket(null);
});
document.querySelector('#create').addEventListener('click', () => connect({ type: 'create' }));
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
function startCpu() {
  solo.restart(3, selectedCpuLevel);
  accumulator = 0;
  setMode('solo');
  finishedNoted = false;
  track('game_start', { mode: 'cpu', level: String(selectedCpuLevel ?? 'random') });
}
document.querySelector('#cpu').addEventListener('click', startCpu);

if (testEffects) {
  // A CPU Lv.4 match straight away, with a button (or number key 1-7) per effect.
  selectedCpuLevel = 4;
  showCpuLevel();
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
      `${oldNet ? 'OLD net behaviour' : 'new net behaviour'} | mode ${mode} | ${online ? 'ping ' + round(rtts.at(-1)) + 'ms (median ' + round(median(rtts)) + ', worst ' + round(Math.max(...rtts, 0)) + ')' : 'not in an online match'}`,
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
const quick = { on: false, queued: false, found: undefined, finished: false };
const idleMs = 30000;
let lastInput = performance.now();
for (const type of ['pointermove', 'pointerdown', 'keydown']) {
  document.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true });
}

function showQueueStatus() {
  // Only for the first countdown after a match is found, not for rematches.
  const found = quick.on && mode === 'online' && quick.found !== undefined;
  const looking = quick.on && mode === 'solo';
  queueStatus.hidden = !(found || looking);
  queueStatus.toggleAttribute('data-found', found);
  setText(queueStatus, found ? 'Opponent found!' : looking ? 'Looking for a player…' : '');
}

function updateQueue() {
  const want = quick.on && mode === 'solo' && document.visibilityState === 'visible' &&
    performance.now() - lastInput < idleMs;
  if (want !== quick.queued && socket?.readyState === WebSocket.OPEN) {
    send({ type: want ? 'queue' : 'unqueue' });
    if (!want) quick.queued = false;
  }
}
setInterval(updateQueue, 1000);
document.addEventListener('visibilitychange', updateQueue);

function backToQuick(abortReason) {
  if (abortReason) track('quick_match_abort');
  leave('', true);
  startCpu();
  connect({ type: 'queue' }, 'quick');
}

document.querySelector('#quick').addEventListener('click', () => {
  quick.on = true;
  track('quick_match_enter');
  startCpu();
  connect({ type: 'queue' }, 'quick');
  showQueueStatus();
});
joinForm.addEventListener('submit', event => {
  event.preventDefault();
  const code = normalizeRoomCode(codeInput.value);
  if (!code) {
    setMode('join', 'Room not found.');
    codeInput.focus();
    return;
  }
  connect({ type: 'join', code });
});
codeInput.addEventListener('input', () => {
  if (mode === 'join' && !socket) setMode('join');
});
back.addEventListener('click', () => leave());

let copyReset;
function showCopyResult(label) {
  setText(copyLink, label);
  clearTimeout(copyReset);
  copyReset = setTimeout(() => setText(copyLink, 'COPY LINK'), 1600);
}
copyLink.addEventListener('click', async () => {
  // On a portal, invite links stay on the portal (CrazyGames) or point at our site.
  const link = portalInviteLink(roomCode.value) ?? roomLink(roomCode.value, portal ? siteUrl : location.href);
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
initPortal().then(() => {
  loadingStart();
  const invitedRoom = roomFromLink(location.href) ?? normalizeRoomCode(portalInviteRoom());
  if (invitedRoom) {
    if (!portal) history.replaceState(null, '', location.pathname);
    codeInput.value = invitedRoom;
    connect({ type: 'join', code: invitedRoom }, 'link');
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
trackVisit();
startHeartbeat(() => mode === 'solo' ? 'cpu' : mode === 'online' ? 'online' : 'menu');

// Sound can only start from a click, tap or key press.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => sound.unlock(), { capture: true });
}
function showSoundState() {
  // Shows what is heard: a portal mute shows as muted even if the button was left on.
  soundToggle.setAttribute('aria-pressed', String(!sound.audible));
  const label = sound.portalMuted ? 'Sound muted by CrazyGames' : sound.enabled ? 'Mute sound' : 'Turn sound on';
  soundToggle.setAttribute('aria-label', label);
  soundToggle.title = label;
}
soundToggle.addEventListener('click', () => {
  sound.toggle();
  showSoundState();
});
showSoundState();
gameControl.addEventListener('click', () => {
  if (currentView().phase === 'finished' || onlineView?.phase === 'finished') {
    track('rematch', { mode: mode === 'solo' ? 'cpu' : 'online' });
  }
  finishedNoted = false;
  // Online restarts arrive as a new 'start' message; CPU ones are counted here.
  if (mode === 'solo') track('game_start', { mode: 'cpu', level: selectedCpuLevel ?? 'random' });
  if (mode === 'solo') solo.restart(3, selectedCpuLevel);
  else send({ type: 'restart' });
});
resize();
new ResizeObserver(resize).observe(court);
requestAnimationFrame(frame);
