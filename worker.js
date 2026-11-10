import { DurableObject } from 'cloudflare:workers';
import { createRooms } from './rooms.js';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/play' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
        request.headers.get('Origin') !== url.origin) {
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
