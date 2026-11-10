export function onRequest({ request, env }) {
  return env.MATCHMAKER.fetch(request);
}
