import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createRooms } from './rooms.js';

const files = new Map();
for (const name of ['index.html', 'fonts.html', 'client.js', 'playback.js', 'game.js', 'brand-shuttles.js', 'room-link.js', 'demo.js', 'analytics.js', 'event-schema.js', 'sound.js', 'sound-synth.js', 'sound-cues.js', 'juice.js', 'stands.js', 'crowd.js', 'link-quality.js', 'confetti.js', 'net-send.js', 'net-quality.js', 'portal.js', 'gd-ads.js', 'frame-meter.js', 'fullscreen.js', 'features.js', 'touch-layout.js']) {
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
const rooms = createRooms(randomInt);

http.on('upgrade', (request, socket, head) => {
  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.headers.origin).host === request.headers.host;
  } catch {
    // Browser clients always send Origin.
  }
  if (request.url?.split('?')[0] !== '/play' || !sameOrigin || websocket.clients.size >= 256) {
    socket.destroy();
    return;
  }
  websocket.handleUpgrade(request, socket, head, peer => websocket.emit('connection', peer, request));
});

websocket.on('connection', (peer, request) => {
  peer.lastPong = Date.now();
  peer.on('error', () => peer.terminate());
  peer.on('pong', () => { peer.lastPong = Date.now(); });
  const url = new URL(request.url, 'http://localhost');
  rooms.attach(peer, { restartBarrier: true, bombEffects: url.searchParams.get('bomb') === '1' });
});

setInterval(() => {
  const now = Date.now();
  for (const peer of websocket.clients) {
    if (now - peer.lastPong > 60000) peer.terminate();
    else if (peer.readyState === WebSocket.OPEN) peer.ping();
  }
}, 30000);

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8766);
http.listen(port, host, () => console.log('ODD BIRDLE at http://' + host + ':' + port + '/'));
