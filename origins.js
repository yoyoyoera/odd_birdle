// Browser origins allowed to play online and send play counts, and the
// source name each one is counted under. CrazyGames serves games from several
// crazygames.com origins; itch.io serves HTML games from *.itch.zone; Newgrounds frames uploaded
// HTML5 games into its pages from uploads.ungrounded.net (that one host, not the whole domain).
// The CrazyGames iOS app embeds games from this (non-https) page; it is allowed as one exact origin.
const appOrigins = new Map([['capacitor://app.crazygames.com', 'crazygames']]);

export function requiresRematchReady(origin) {
  return ['y8', 'gamepix', 'gamedistribution'].includes(originSource(origin));
}

export function originSource(origin) {
  if (appOrigins.has(origin)) return appOrigins.get(origin);
  let url;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  const host = url.hostname;
  const within = domain => host === domain || host.endsWith('.' + domain);
  if (within('oddbirdle.pages.dev')) return 'site';
  if (within('crazygames.com')) return 'crazygames';
  if (within('itch.zone') || within('itch.io')) return 'itch';
  if (host === 'uploads.ungrounded.net') return 'newgrounds';
  // Y8 serves uploaded games from its item CDN (seen in the server log when a test build tried to connect): that one host.
  // Live GD frames and the revision frame supplied by its developer dashboard.
  if (host === 'html5.gamedistribution.com' || host === 'revision.gamedistribution.com') return 'gamedistribution';
  if (host === 'item-cdn.y8.com') return 'y8';
  return undefined;
}
