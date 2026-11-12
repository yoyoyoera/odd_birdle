// Browser origins allowed to play online and send play counts, and the
// source name each one is counted under. CrazyGames serves games from several
// crazygames.com origins; itch.io serves HTML games from *.itch.zone.
// The CrazyGames iOS app embeds games from this (non-https) page; it is allowed as one exact origin.
const appOrigins = new Map([['capacitor://app.crazygames.com', 'crazygames']]);

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
  return undefined;
}
