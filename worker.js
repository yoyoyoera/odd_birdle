import { DurableObject } from 'cloudflare:workers';
import { createRooms } from './rooms.js';
import { originSource } from './origins.js';

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
    return env.ROOMS.getByName('lobby').fetch(request);
  }
};

export class RoomHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = createRooms(limit => crypto.getRandomValues(new Uint32Array(1))[0] % limit);
  }

  fetch() {
    if (this.rooms.size >= 256) return new Response('Lobby full', { status: 503 });
    const pair = new WebSocketPair();
    pair[1].accept();
    this.rooms.attach(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
