// The phone app's DAILY and accounts server (app-server/): this page forwards /api/app/* to it.
export function onRequest({ request, env }) {
  return env.APP_API.fetch(request);
}
