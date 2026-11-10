import { createGame, step } from './game.js';

export function createRooms(randomIndex) {
  const rooms = new Map();
  const roomLifetime = 10 * 60 * 1000;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let previousTick = performance.now();
  let accumulator = 0;
  let snapshotTime = 0;
  let simulationTick = 0;

  const peers = new Set();
  let tickTimer;
  let expiryTimer;

  function send(peer, message) {
    if (peer.readyState === 1 && (peer.bufferedAmount ?? 0) < 65536) {
      peer.send(JSON.stringify(message));
    }
  }

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomIndex(alphabet.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  function start(room, firstMatch = false) {
    room.game.restart(firstMatch ? 3 : 0);
    room.history = [];
    const state = room.game.view();
    const time = simulationTick * step * 1000;
    send(room.left, { type: 'start', side: 'left', time, state });
    send(room.right, { type: 'start', side: 'right', time, state });
  }

  function frameAt(room, seenTime) {
    const now = simulationTick * step * 1000;
    if (!Number.isFinite(seenTime) || seenTime > now || now - seenTime > 320) return undefined;
    const index = room.history.findLastIndex(entry => entry.time <= seenTime);
    if (index < 0) return undefined;
    const before = room.history[index];
    const after = room.history[index + 1];
    const frame = before.frame;
    const next = after?.frame;
    if (!frame || !next || frame.flight !== next.flight || frame.size !== next.size ||
        frame.canHit !== next.canHit) return frame;
    const fraction = (seenTime - before.time) / (after.time - before.time);
    return {
      ...frame,
      x: frame.x + (next.x - frame.x) * fraction,
      y: frame.y + (next.y - frame.y) * fraction,
      angle: frame.angle + (next.angle - frame.angle) * fraction
    };
  }

  function closeRoom(room, departing) {
    rooms.delete(room.code);
    for (const peer of [room.left, room.right]) {
      if (!peer || peer === departing) continue;
      send(peer, departing ? { type: 'left' } : { type: 'error', message: 'Room code expired.' });
      peer.close();
    }
  }

  function attach(peer) {
    peers.add(peer);
    startTimers();
    let room;
    let side;
    let windowStart = performance.now();
    let messages = 0;
    peer.addEventListener('close', () => {
      peers.delete(peer);
      if (room && rooms.get(room.code) === room) closeRoom(room, peer);
      if (!peers.size) stopTimers();
    });
    peer.addEventListener('message', ({ data: raw }) => {
      if (typeof raw !== 'string' || raw.length > 512) return;
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
            room.game.moveRacket(side, input, frameAt(room, message.seenTime));
          }
        }
        if (message.type === 'hold') {
          room.game.holdRacket(side, frameAt(room, message.seenTime), message.time);
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
        if (!target || target.right || target.expiresAt <= Date.now() || target.left.readyState !== 1) {
          send(peer, { type: 'error', message: 'Room not found.' });
          return;
        }
        room = target;
        side = 'right';
        room.right = peer;
        room.game = createGame();
        start(room, true);
      }
    });
  }

  function tick() {
    const now = performance.now();
    const elapsed = Math.min((now - previousTick) / 1000, 0.1);
    previousTick = now;
    accumulator += elapsed;
    snapshotTime += elapsed;
    while (accumulator >= step) {
      simulationTick++;
      for (const room of rooms.values()) {
        if (!room.game) continue;
        room.game.simulate(step);
        room.history.push({ time: simulationTick * step * 1000, frame: room.game.contactFrame() });
        if (room.history.length > 42) room.history.shift();
      }
      accumulator -= step;
    }
    if (snapshotTime >= 1 / 60) {
      snapshotTime %= 1 / 60;
      for (const room of rooms.values()) {
        if (!room.game) continue;
        const message = { type: 'state', time: simulationTick * step * 1000, state: room.game.view() };
        send(room.left, message);
        send(room.right, message);
      }
    }
  }


  function startTimers() {
    if (tickTimer) return;
    previousTick = performance.now();
    accumulator = 0;
    snapshotTime = 0;
    tickTimer = setInterval(tick, 8);
    expiryTimer = setInterval(() => {
      const now = Date.now();
      for (const room of rooms.values()) {
        if (!room.game && room.expiresAt <= now) closeRoom(room);
      }
    }, 30000);
  }

  function stopTimers() {
    clearInterval(tickTimer);
    clearInterval(expiryTimer);
    tickTimer = undefined;
    expiryTimer = undefined;
  }

  return { attach, get size() { return peers.size; } };
}
