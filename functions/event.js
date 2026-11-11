import { cleanEvent, fields } from '../event-schema.js';

// Writes one anonymous data point to Workers Analytics Engine (binding EVENTS).
export async function onRequestPost({ request, env }) {
  if (Number(request.headers.get('content-length') ?? 0) > 256) return new Response(null, { status: 413 });
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
      blobs: [event.name, ...fields.map(field => event[field] ?? '')],
      doubles: [1]
    });
  } catch {
    // Dropped silently.
  }
  return new Response(null, { status: 204 });
}
