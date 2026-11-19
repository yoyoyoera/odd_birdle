// Local matchmaker for the *-local builds (the live server only accepts real portal origins).
// Uses this repo's rooms.js and treats every player like Y8 (rematches need both players ready).
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createRooms } from '../../rooms.js';
const http = createServer((q, r) => r.writeHead(404).end());
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 });
const rooms = createRooms(randomInt);
http.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, peer => rooms.attach(peer, { restartBarrier: true })));
http.listen(8772, '127.0.0.1', () => console.log('relay ws://127.0.0.1:8772/play'));
