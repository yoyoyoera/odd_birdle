// The phone app tells the server when something breaks, so a bug shows up without anyone writing in. Only the kind of error
// and where: no name, no id, no address. At most a few per launch, and the same error is sent once.
export function createErrorReporter({ send, platform = 'web', version = 'unknown', mode = () => 'other', limit = 5 } = {}) {
  const seen = new Set();
  return function report(error, place = '') {
    try {
      const message = String(error?.message ?? error ?? '').slice(0, 300);
      if (!message || message === '[object Object]') return false;
      const key = message + '|' + place;
      if (seen.has(key) || seen.size >= limit) return false;
      seen.add(key);
      send({ message, place, platform, version, mode: mode() });
      return true;
    } catch {
      return false;
    }
  };
}

// A stack line ending in "client.js:123:45" becomes "client.js:123": the line where it happened, without any path.
export function placeOf(error, fallback = '') {
  const frame = String(error?.stack ?? '').split('\n').find(line => /\.js:\d+/.test(line));
  const match = frame && /([\w.-]+\.js):(\d+)/.exec(frame);
  return match ? `${match[1]}:${match[2]}` : fallback;
}
