import { center, clamp, createGame, floor, height, leftLine, netTop, racketRadius, rightLine, shuttleOutline, step, width, contactMotion, isSwing, projectStrike, racketTouches, swingMotion } from './game.js';
import { createPlayback } from './playback.js';

const court = document.querySelector('#court');
const ctx = court.getContext('2d');
const stage = document.querySelector('#stage');
const scoreboard = document.querySelector('#score');
const sideLabel = document.querySelector('#side-label');
const winnerLabel = document.querySelector('#winner');
const status = document.querySelector('#status');
const eventBanner = document.querySelector('#event-banner');
const gameControl = document.querySelector('#game-control');
const menu = document.querySelector('#menu');
const back = document.querySelector('#back');
const roomDisplay = document.querySelector('#room-display');
const roomCode = document.querySelector('#room-code');
const joinForm = document.querySelector('#join-form');
const codeInput = document.querySelector('#code-input');
const lobbyMessage = document.querySelector('#lobby-message');
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

const solo = createGame({ withCpu: true });
const ready = { phase: 'ready' };
let socket;
let onlineView;
const playback = createPlayback();
let mode = 'menu';
let localSide = 'left';
let localRacket;
let lastFrame;
let lastHold = -Infinity;
let displayedShuttle;
let displayedWarp;
let displayedFrozen = false;
let prediction;
let predictedFlight;
let localOverlap = false;
let accumulator = 0;

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
  displayedWarp = undefined;
  displayedFrozen = false;
  prediction = undefined;
  predictedFlight = undefined;
  localOverlap = false;
  lastHold = -Infinity;
}

function leave(message = '') {
  const previous = socket;
  socket = undefined;
  previous?.close();
  onlineView = undefined;
  playback.reset();
  resetPrediction();
  localRacket = undefined;
  localSide = 'left';
  setMode('menu', message);
}

function connect(request) {
  const join = request.type === 'join';
  if (socket) return;
  setMode(join ? 'join' : 'connecting');
  const url = new URL('./play', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(url);
  socket = connection;
  connection.addEventListener('open', () => {
    if (socket === connection) send(request);
  });
  connection.addEventListener('message', ({ data }) => {
    if (socket !== connection) return;
    const message = JSON.parse(data);
    switch (message.type) {
      case 'room':
        roomCode.value = message.code;
        setMode('waiting');
        break;
      case 'start':
        localSide = message.side;
        localRacket = undefined;
        onlineView = message.state;
        playback.reset();
        resetPrediction();
        playback.push(message.time, message.state, performance.now());
        setMode('online');
        break;
      case 'state':
        onlineView = message.state;
        playback.push(message.time, message.state, performance.now());
        break;
      case 'error':
        leave();
        setMode(join ? 'join' : 'menu', message.message);
        if (join) codeInput.focus();
        break;
      case 'left':
        leave('Opponent left.');
        break;
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    const wasPlaying = mode === 'online';
    leave(wasPlaying ? 'Connection lost.' : 'Could not connect.');
  });
}

function updateHud(view) {
  const { phase, score, eventText = '', eventWind = false, winner, message = '' } = view;
  if (stage.dataset.phase !== phase) stage.dataset.phase = phase;
  scoreboard.hidden = !score;
  sideLabel.hidden = mode !== 'online';
  sideLabel.dataset.side = localSide;
  if (score) {
    const value = score.left + ':' + score.right;
    if (scoreboard.value !== value) scoreboard.value = value;
  }
  winnerLabel.hidden = !winner;
  setText(winnerLabel, winner ? (winner === localSide ? 'You Win!' : 'You Lose..') : '');
  setText(status, message);
  eventBanner.hidden = !eventText;
  eventBanner.toggleAttribute('data-wind', eventWind);
  setText(eventBanner, eventText);
  gameControl.hidden = mode !== 'solo' && !(mode === 'online' && phase === 'finished');
}

function currentView() {
  return mode === 'solo' ? solo.view() : onlineView ?? ready;
}

function predictContact(from, to, motion, time) {
  const shuttle = displayedShuttle;
  if (!shuttle || (shuttle.x < center ? 'left' : 'right') !== localSide) {
    localOverlap = false;
    return false;
  }
  const overlaps = racketTouches(shuttle, to);
  if (localOverlap) {
    if (!overlaps) localOverlap = false;
    return false;
  }
  if (!shuttle.canHit || prediction || predictedFlight === shuttle.flight ||
      (!overlaps && !racketTouches(shuttle, from, to))) return false;
  localOverlap = overlaps;
  predictedFlight = shuttle.flight;
  prediction = { shuttle, motion, started: time };
  return true;
}

function predictedView(view, time) {
  if (!prediction) return view;
  if (view.phase !== 'live' || !view.shuttle) {
    prediction = undefined;
    return view;
  }
  const elapsed = Math.max(0, time - prediction.started);
  if (!prediction.correction) {
    const projected = projectStrike(prediction.shuttle, prediction.motion, Math.min(elapsed, 280) / 1000);
    const bottom = Math.max(...shuttleOutline(projected).flat().map(point => point.y));
    projected.y = Math.min(projected.y, floor - bottom);
    if (view.shuttle.flight === prediction.shuttle.flight && elapsed < 280) {
      return { ...view, shuttle: projected, flash: Math.max(0, 0.22 - elapsed / 1000) };
    }
    prediction.correction = { started: time, x: projected.x - view.shuttle.x, y: projected.y - view.shuttle.y };
  }
  const { started, x, y } = prediction.correction;
  const weight = Math.max(0, 1 - (time - started) / 70);
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
    if (input && previous) {
      if (isSwing(localRacket)) predictContact(previous, input, localRacket, performance.now());
    }
    send({ type: 'racket', input, seenTime: playback.displayedTime });
  }
}

function moveRacket(event) {
  const phase = currentView().phase;
  if ((phase !== 'live' && phase !== 'between' && phase !== 'starting') || !event.isPrimary ||
      (event.pointerType !== 'mouse' && event.buttons === 0)) return;
  const bounds = court.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * width / bounds.width;
  setRacket({
    x: localSide === 'left' ? clamp(x, 0, center - racketRadius) : clamp(x, center + racketRadius, width),
    y: clamp((event.clientY - bounds.top) * height / bounds.height, 0, floor),
    time: event.timeStamp
  });
}

function drawRacket(position, fill, stroke) {
  ctx.beginPath();
  ctx.arc(position.x, position.y, racketRadius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawCourt() {
  ctx.fillStyle = palette.court;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, floor, width, height - floor);
  ctx.fillStyle = palette.line;
  ctx.fillRect(leftLine, floor, rightLine - leftLine, 8);

  ctx.fillStyle = palette.net;
  ctx.fillRect(center - 2, netTop, 4, floor - netTop);
  ctx.fillRect(center - 9, netTop, 18, 4);
  ctx.fillStyle = '#f7f6e9';
  for (const x of [leftLine, center, rightLine]) ctx.fillRect(x - 2, floor, 4, 8);
}

function draw(view) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (view.shake && !reduceMotion.matches) {
    const t = view.shake;
    ctx.translate(Math.sin(t * 91) * 17 * t, Math.cos(t * 117) * 12 * t);
  }
  drawCourt();
  if (view.phase !== 'ready') {
    const other = localSide === 'left' ? 'right' : 'left';
    if (view[other]) drawRacket(view[other], '#cf936b99', '#774935');
    const ownRacket = socket ? localRacket : view[localSide];
    if (ownRacket && view.phase !== 'finished') drawRacket(ownRacket, '#a9d67877', palette.ink);
    if (view.shuttle) drawShuttle(view);
  }
  ctx.restore();
}

function drawShuttle({ flash, phase, shuttle }) {
  if (flash > 0 && phase === 'live') {
    ctx.beginPath();
    ctx.arc(shuttle.x, shuttle.y, 26 + (0.22 - flash) * 105, 0, Math.PI * 2);
    ctx.globalAlpha = flash / 0.22;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
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
  ctx.fillStyle = phase === 'live' ? palette.ink : palette.net;
  ctx.fill('evenodd');
}

function frame(time) {
  if (mode === 'solo' && lastFrame !== undefined) {
    accumulator += Math.min((time - lastFrame) / 1000, 0.05);
    while (accumulator >= step) {
      solo.simulate(step);
      accumulator -= step;
    }
  }
  lastFrame = time;
  const view = mode === 'online' ? playback.at(time) ?? currentView() : currentView();
  if (view.frozen || view.warp !== displayedWarp) {
    prediction = undefined;
    localOverlap = false;
  }
  if (view.frozen && localRacket) Object.assign(localRacket, { vx: 0, vy: 0 });
  displayedWarp = view.warp;
  displayedFrozen = view.frozen;
  displayedShuttle = view.phase === 'live' && !view.frozen ? view.shuttle : undefined;
  if (mode === 'online' && localRacket && view.phase === 'live' && !view.frozen) {
    const hit = predictContact(localRacket, localRacket, contactMotion(localRacket, time), time);
    if (hit || time - lastHold >= 45) {
      lastHold = time;
      send({ type: 'hold', seenTime: playback.displayedTime, time });
    }
  }
  updateHud(view);
  draw(mode === 'online' ? predictedView(view, time) : view);
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
document.querySelector('#cpu').addEventListener('click', () => {
  solo.restart(3);
  accumulator = 0;
  setMode('solo');
});
joinForm.addEventListener('submit', event => {
  event.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
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
gameControl.addEventListener('click', () => {
  if (mode === 'solo') solo.restart();
  else send({ type: 'restart' });
});
resize();
new ResizeObserver(resize).observe(court);
requestAnimationFrame(frame);
