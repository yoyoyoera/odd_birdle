export function onRequest({ request, env }) {
  // The player's place, from Cloudflare's own view of this request. A client can never send it itself.
  const forwarded = new Request(request);
  forwarded.headers.delete('x-geo');
  const { latitude, longitude } = request.cf ?? {};
  if (latitude && longitude) forwarded.headers.set('x-geo', latitude + ',' + longitude);
  return env.MATCHMAKER.fetch(forwarded);
}
