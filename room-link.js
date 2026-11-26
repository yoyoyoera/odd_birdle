const codePattern = /^[A-Z0-9]{6}$/;

export function normalizeRoomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return codePattern.test(code) ? code : undefined;
}

// Invite links point at the page itself with ?room=CODE.
export function roomLink(code, href) {
  const url = new URL('./', href);
  url.search = new URLSearchParams({ room: code }).toString();
  url.hash = '';
  return url.href;
}

export function roomFromLink(href) {
  return normalizeRoomCode(new URL(href).searchParams.get('room'));
}

// The link the phone app shares: the site address plus /join/CODE. With the app installed it opens the app; otherwise the site sends
// the visitor on to the game in the browser, in the same room.
export function inviteUrl(code, site) {
  return new URL('/join/' + code, site).href;
}

// The room in an invite link the app was opened with (either the /join/CODE form or the older ?room=CODE form).
export function roomFromInvite(href) {
  try {
    const url = new URL(href);
    const path = /^\/join\/([A-Za-z0-9]{6})\/?$/.exec(url.pathname);
    return normalizeRoomCode(path?.[1]) ?? roomFromLink(url.href);
  } catch {
    return undefined;
  }
}
