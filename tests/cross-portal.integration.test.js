import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createRooms } from '../rooms.js';
import { originSource, requiresRematchReady } from '../origins.js';

test('real WebSockets: all 25 website/Y8/itch/GD/GamePix pairs support code rooms and quick matches with ready rematches', async t => {
  let clock = 0;
  let tick;
  let nextCode = 0;
  t.mock.method(performance, 'now', () => clock);
  t.mock.method(Math, 'random', () => 0.1);
  t.mock.method(globalThis, 'setInterval', (handler, ms) => { if (ms === 8) tick = handler; return ms; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const rooms = createRooms(limit => nextCode++ % limit);
  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!originSource(req.headers.origin)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, peer => rooms.attach(peer, {
      restartBarrier: requiresRematchReady(req.headers.origin)
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `ws://127.0.0.1:${server.address().port}/play`;
  const origins = {
    site: 'https://oddbirdle.pages.dev', y8: 'https://item-cdn.y8.com',
    itch: 'https://html-classic.itch.zone', gd: 'https://revision.gamedistribution.com', gamepix: 'https://games.gamepix.com'
  };
  const immediate = () => new Promise(resolve => setImmediate(resolve));
  const wait = async (condition, label) => {
    const timeout = Date.now() + 3000;
    while (!condition()) {
      assert.ok(Date.now() < timeout, label);
      await immediate();
    }
  };
  const connect = async name => {
    const socket = new WebSocket(endpoint, { origin: origins[name] });
    const messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    await once(socket, 'open');
    return {
      socket, messages, name,
      send: value => socket.send(JSON.stringify(value)),
      starts: () => messages.filter(m => m.type === 'start'),
      latest: () => messages.at(-1)
    };
  };
  const finishMatch = async peer => {
    for (let i = 0; i < 30000 && peer.latest()?.state?.phase !== 'finished'; i++) {
      clock += 16;
      tick();
      if (i % 30 === 0) await immediate();
    }
    await wait(() => peer.latest()?.state?.phase === 'finished', 'match must finish');
  };
  try {
    for (const quick of [false, true]) for (const left of Object.keys(origins)) for (const right of Object.keys(origins)) {
      const a = await connect(left);
      const b = await connect(right);
      try {
        if (quick) {
          a.send({ type: 'queue' });
          await wait(() => a.latest()?.type === 'queued', 'first player enters the shared queue');
          b.send({ type: 'queue' });
        } else {
          a.send({ type: 'create', ...(['gd', 'gamepix'].includes(left) ? { restartBarrier: true } : {}) });
          await wait(() => a.latest()?.type === 'room', 'host receives room code');
          b.send({ type: 'join', code: a.latest().code, ...(['gd', 'gamepix'].includes(right) ? { restartBarrier: true } : {}) });
        }
        await wait(() => a.starts().length === 1 && b.starts().length === 1, 'both get initial countdown');
        assert.equal(a.starts()[0].state.eventText, '3');
        // Two completed matches exercise resetting readiness between rounds.
        for (let replay = 0; replay < 2; replay++) {
          await finishMatch(a);
          await wait(() => b.latest()?.state?.phase === 'finished', 'guest sees match finish');
          const count = a.starts().length;
          const round = a.starts().at(-1).round;
          const restart = peer => peer.send({ type: 'restart', ...(['gd', 'gamepix'].includes(peer.name) ? { round } : {}) });
          // Alternate who clicks first. Old clients send no new capability or round fields.
          const first = replay ? b : a;
          const second = replay ? a : b;
          restart(first);
          {
            await wait(() => first.latest()?.type === 'rematch_wait', 'first player waits for the other');
            restart(first);
            await wait(() => first.latest()?.type === 'rematch_wait', 'duplicate readiness is harmless');
            assert.equal(a.starts().length, count, `${left}/${right}: must not start before the other player is ready`);
            restart(second); // Sent only after that player's own ad/Continue is finished.
          }
          await wait(() => a.starts().length === count + 1 && b.starts().length === count + 1, 'both get new countdown');
          assert.equal(a.starts().at(-1).state.eventText, '3');
          assert.equal(a.starts().at(-1).round, round + 1);
        }
        t.diagnostic(`${quick ? 'quick' : 'code'} ${left} → ${right}: initial match and two rematches passed`);
      } finally {
        const closed = [once(a.socket, 'close'), once(b.socket, 'close')];
        a.socket.close(); b.socket.close();
        await Promise.all(closed);
      }
    }
  } finally {
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
