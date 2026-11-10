import { center, clamp, createGame, floor, height, leftLine, netTop, racketRadius, rightLine, step, width } from './game.js';

const court = document.querySelector('#court');
const ctx = court.getContext('2d');
const stage = document.querySelector('main');
const scoreboard = document.querySelector('#score');
const winnerLabel = document.querySelector('#winner');
const status = document.querySelector('#status');
const eventBanner = document.querySelector('#event-banner');
const gameControl = document.querySelector('#game-control');
const menu = document.querySelector('#menu');
const back = document.querySelector('#back');
const roomCode = document.querySelector('#room-code');
const joinForm = document.querySelector('#join-form');
const codeInput = document.querySelector('#code-input');
const lobbyMessage = document.querySelector('#lobby-message');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const solo = createGame({ withCpu: true });
const ready = { phase: 'ready' };
let socket;
let onlineView;
let mode = 'menu';
let localSide = 'left';
let localRacket;
let lastFrame;
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
  roomCode.hidden = next !== 'waiting';
  joinForm.hidden = next !== 'join';
  back.hidden = next === 'menu';
  lobbyMessage.hidden = !message;
  setText(lobbyMessage, message);
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function leave(message = '') {
  const previous = socket;
  socket = undefined;
  previous?.close();
  onlineView = undefined;
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
        setMode('online');
        break;
      case 'state':
        onlineView = message.state;
        break;
      case 'error':
        leave();
        setMode(join ? 'join' : 'menu', message.message);
        if (join) codeInput.focus();
        break;
      case 'left':
        leave('상대가 나갔어요.');
        break;
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    const wasPlaying = mode === 'online';
    leave(wasPlaying ? '연결이 끊겼어요.' : '방에 연결할 수 없어요.');
  });
}

function updateHud(view) {
  const { phase, score, eventText = '', eventWind = false, winner, message = '' } = view;
  if (stage.dataset.phase !== phase) stage.dataset.phase = phase;
  scoreboard.hidden = !score;
  if (score) {
    const value = score.left + ':' + score.right;
    if (scoreboard.value !== value) scoreboard.value = value;
  }
  winnerLabel.hidden = !winner;
  const name = winner === localSide ? 'YOU' : mode === 'solo' ? 'CPU' : 'P' + (winner === 'left' ? '1' : '2');
  setText(winnerLabel, winner ? name + ' win!' : '');
  setText(status, message);
  eventBanner.hidden = !eventText;
  eventBanner.toggleAttribute('data-wind', eventWind);
  setText(eventBanner, eventText);
  gameControl.hidden = mode !== 'solo' && !(mode === 'online' && phase === 'finished');
}

function currentView() {
  return mode === 'solo' ? solo.view() : onlineView ?? ready;
}

function setRacket(input) {
  if (mode === 'solo') solo.moveRacket('left', input);
  if (mode === 'online') {
    localRacket = input;
    send({ type: 'racket', input });
  }
}

function moveRacket(event) {
  const phase = currentView().phase;
  if ((phase !== 'live' && phase !== 'between') || !event.isPrimary ||
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
  ctx.fillStyle = '#e8ebd6';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#c0cbb4';
  ctx.fillRect(0, floor, width, height - floor);
  ctx.fillStyle = '#6d8e72';
  ctx.fillRect(leftLine, floor, rightLine - leftLine, 8);

  ctx.fillStyle = '#476755';
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
    if (ownRacket && view.phase !== 'finished') drawRacket(ownRacket, '#a9d67877', '#274d3b');
    if (view.shuttle) drawShuttle(view);
  }
  ctx.restore();
}

function drawShuttle({ flash, phase, shuttle, outline }) {
  if (flash > 0 && phase === 'live') {
    ctx.beginPath();
    ctx.arc(shuttle.x, shuttle.y, 26 + (0.22 - flash) * 105, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(33, 102, 64, ' + flash / 0.22 + ')';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  for (const ring of outline) {
    ring.forEach((point, index) => {
      const x = shuttle.x + point.x;
      const y = shuttle.y + point.y;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = phase === 'live' ? '#274d3b' : '#667165';
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
  const view = currentView();
  updateHud(view);
  draw(view);
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
  solo.restart();
  accumulator = 0;
  setMode('solo');
});
joinForm.addEventListener('submit', event => {
  event.preventDefault();
  connect({ type: 'join', code: codeInput.value.trim().toUpperCase() });
});
back.addEventListener('click', () => leave());
gameControl.addEventListener('click', () => {
  if (mode === 'solo') solo.restart();
  else send({ type: 'restart' });
});
resize();
new ResizeObserver(resize).observe(court);
requestAnimationFrame(frame);
