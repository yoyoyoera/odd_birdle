import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createGame, step } from './game.js';

const files = new Map();
for (const name of ['index.html', 'fonts.html', 'client.js', 'game.js', 'brand-shuttles.js']) {
  files.set('/' + name, {
    data: readFileSync(new URL('./' + name, import.meta.url)),
    type: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'
  });
}
files.set('/', files.get('/index.html'));

const http = createServer((request, response) => {
  const file = files.get(request.url?.split('?')[0]);
  if (!file || (request.method !== 'GET' && request.method !== 'HEAD')) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-cache' });
  response.end(request.method === 'HEAD' ? undefined : file.data);
});
const websocket = new WebSocketServer({ noServer: true, maxPayload: 512 });
const rooms = new Map();
const roomLifetime = 10 * 60 * 1000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let previousTick = performance.now();
let accumulator = 0;
let snapshotTime = 0;

http.on('upgrade', (request, socket, head) => {
  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.headers.origin).host === request.headers.host;
  } catch {
    // Browser clients always send Origin.
  }
  if (request.url !== '/play' || !sameOrigin || websocket.clients.size >= 256) {
    socket.destroy();
    return;
  }
  websocket.handleUpgrade(request, socket, head, peer => websocket.emit('connection', peer));
});

function send(peer, message) {
  if (peer.readyState === WebSocket.OPEN && peer.bufferedAmount < 65536) {
    peer.send(JSON.stringify(message));
  }
}

function newCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function start(room) {
  room.game.restart();
  const state = room.game.view();
  send(room.left, { type: 'start', side: 'left', state });
  send(room.right, { type: 'start', side: 'right', state });
}

function closeRoom(room, departing) {
  rooms.delete(room.code);
  for (const peer of [room.left, room.right]) {
    if (!peer || peer === departing) continue;
    send(peer, departing ? { type: 'left' } : { type: 'error', message: '방 코드가 만료됐어요.' });
    peer.close();
  }
}

websocket.on('connection', peer => {
  let room;
  let side;
  let windowStart = performance.now();
  let messages = 0;
  peer.lastPong = Date.now();
  peer.on('error', () => peer.terminate());
  peer.on('pong', () => { peer.lastPong = Date.now(); });
  peer.on('close', () => {
    if (room && rooms.get(room.code) === room) closeRoom(room, peer);
  });
  peer.on('message', raw => {
    const now = performance.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      messages = 0;
    }
    if (++messages > 320) {
      peer.close(1008);
      return;
    }
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (room?.game) {
      if (message.type === 'restart' && room.game.view().phase === 'finished') start(room);
      if (message.type === 'racket') {
        const input = message.input;
        if (input === null || (input && [input.x, input.y, input.time].every(Number.isFinite))) {
          room.game.moveRacket(side, input);
        }
      }
      return;
    }
    if (room) return;

    if (message.type === 'create') {
      const code = newCode();
      room = { code, left: peer, expiresAt: Date.now() + roomLifetime };
      side = 'left';
      rooms.set(code, room);
      send(peer, { type: 'room', code });
    } else if (message.type === 'join') {
      const target = rooms.get(message.code);
      if (!target || target.right || target.expiresAt <= Date.now() || target.left.readyState !== WebSocket.OPEN) {
        send(peer, { type: 'error', message: '참여할 수 없는 코드예요.' });
        return;
      }
      room = target;
      side = 'right';
      room.right = peer;
      room.game = createGame();
      start(room);
    }
  });
});

setInterval(() => {
  const now = performance.now();
  const elapsed = Math.min((now - previousTick) / 1000, 0.1);
  previousTick = now;
  accumulator += elapsed;
  snapshotTime += elapsed;
  while (accumulator >= step) {
    for (const room of rooms.values()) room.game?.simulate(step);
    accumulator -= step;
  }
  if (snapshotTime >= 1 / 60) {
    snapshotTime %= 1 / 60;
    for (const room of rooms.values()) {
      if (!room.game) continue;
      const message = { type: 'state', state: room.game.view() };
      send(room.left, message);
      send(room.right, message);
    }
  }
}, 8);

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.game && room.expiresAt <= now) closeRoom(room);
  }
  for (const peer of websocket.clients) {
    if (now - peer.lastPong > 60000) peer.terminate();
    else if (peer.readyState === WebSocket.OPEN) peer.ping();
  }
}, 30000);

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8766);
http.listen(port, host, () => console.log('Odd Birdle at http://' + host + ':' + port + '/'));
