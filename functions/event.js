import { cleanEvent, fields } from '../event-schema.js';
import { originSource } from '../origins.js';

// Writes one anonymous data point to Workers Analytics Engine (binding EVENTS).
export async function onRequestPost({ request, env }) {
  if (Number(request.headers.get('content-length') ?? 0) > 256) return new Response(null, { status: 413 });
  const origin = request.headers.get('Origin');
  // Counted by where the game is embedded; the origin comes from the browser, not the page.
  const source = originSource(origin);
  if (!source) {
    console.log('rejected event origin', origin);
    // Record which hosts were turned away (host only) so portal origins can be added.
    let host = 'none';
    try {
      host = new URL(origin).host.slice(0, 64);
    } catch {
      // Missing or malformed origin.
    }
    try {
      env.EVENTS?.writeDataPoint({ indexes: ['origin_rejected'], blobs: ['origin_rejected', host], doubles: [1] });
    } catch {
      // Dropped silently.
    }
    return new Response(null, { status: 403 });
  }
  let event;
  try {
    event = cleanEvent(JSON.parse(await request.text()));
  } catch {
    event = undefined;
  }
  if (!event) return new Response(null, { status: 400 });
  // On the free plan the binding may be missing or over its daily quota; never fail the page.
  try {
    env.EVENTS?.writeDataPoint({
      indexes: [event.name],
      blobs: [event.name, ...fields.map(field => event[field] ?? ''), source],
      doubles: [1]
    });
  } catch {
    // Dropped silently.
  }
  return new Response(null, { status: 204 });
}
