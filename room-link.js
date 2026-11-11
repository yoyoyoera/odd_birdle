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
