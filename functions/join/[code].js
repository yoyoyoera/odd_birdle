// An invite link: https://oddbirdle.pages.dev/join/ABC123. With the phone app installed, iOS and Android open the app on this
// address (see /.well-known/); everyone else lands here and is sent on to the game in the browser, into the same room.
export function onRequest({ request, params }) {
  const code = String(params.code ?? '').toUpperCase();
  const target = new URL('/', request.url);
  if (/^[A-Z0-9]{6}$/.test(code)) target.searchParams.set('room', code);
  return Response.redirect(target.href, 302);
}
