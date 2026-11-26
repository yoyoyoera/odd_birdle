import { DurableObject } from 'cloudflare:workers';
import { createRooms, parseGeo } from './rooms.js';
import { originSource, requiresRematchReady } from './origins.js';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/play' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Not found', { status: 404 });
    }
    const origin = request.headers.get('Origin');
    if (origin !== url.origin && !originSource(origin)) {
      // Shows up in `wrangler tail` / dashboard logs, to find a portal's real origin.
      console.log('rejected websocket origin', origin);
      return new Response('Not found', { status: 404 });
    }
    // A running Durable Object keeps the code it started with while anyone is connected, so a change that must reach
    // everyone at once moves the lobby to a new name (rooms only live for one visit anyway).
    return env.ROOMS.getByName('lobby-2').fetch(request);
  }
};

export class RoomHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = createRooms(limit => crypto.getRandomValues(new Uint32Array(1))[0] % limit);
  }

  fetch(request) {
    if (this.rooms.size >= 256) return new Response('Lobby full', { status: 503 });
    const pair = new WebSocketPair();
    pair[1].accept();
    const origin = request.headers.get('Origin');
    this.rooms.attach(pair[1], {
      restartBarrier: requiresRematchReady(origin),
      // Where the player is (set by the site's /play function from Cloudflare's own view of the request, never by the client).
      geo: parseGeo(request.headers.get('x-geo')) ?? (request.cf?.latitude && request.cf?.longitude ? parseGeo(request.cf.latitude + ',' + request.cf.longitude) : undefined),
      bombEffects: originSource(origin) === 'site' && new URL(request.url).searchParams.get('bomb') === '1'
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
