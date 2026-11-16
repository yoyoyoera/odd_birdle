import { cleanEvent } from './event-schema.js';
import { portal, serverBase } from './portal.js';

const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// Your own devices stay out of the numbers: open the game once with ?me=1 on each (?me=0 turns it off again).
// The choice lives only in that browser, and the tab title says when it is on.
const meKey = 'oddbirdle-me';
function readMe() {
  try {
    const setting = new URLSearchParams(location.search).get('me');
    if (setting === '1') localStorage.setItem(meKey, '1');
    else if (setting === '0') localStorage.removeItem(meKey);
    return localStorage.getItem(meKey) === '1';
  } catch {
    return false;
  }
}
export const mine = readMe();
if (mine) {
  try {
    document.title += ' (stats off)';
  } catch {
    // No page title to change (tests).
  }
}

// Fire-and-forget anonymous counts; failures never touch the game.
export function track(name, details = {}) {
  const event = cleanEvent({ name, ...details });
  // GamePix builds make no connection but the match server, so nothing is counted there.
  if (!event || local || mine || portal === 'gamepix') return;
  try {
    const body = JSON.stringify(event);
    const endpoint = serverBase + 'event';
    if (!navigator.sendBeacon?.(endpoint, body)) {
      fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Ignore.
  }
}

const heartbeatMs = 60000;

// One anonymous ping per minute per visible tab: pings in a minute ~= people on the page.
export function startHeartbeat(currentMode) {
  const beat = () => {
    if (document.visibilityState === 'visible') track('heartbeat', { mode: currentMode() });
  };
  beat();
  return setInterval(beat, heartbeatMs);
}

// A single yes/no flag in this browser, no identifier, to see if people come back.
export function trackVisit() {
  let returning = 'no';
  try {
    if (localStorage.getItem('oddbirdle-visited')) returning = 'yes';
    else localStorage.setItem('oddbirdle-visited', '1');
  } catch {
    // Private mode or blocked storage: count as new.
  }
  track('page_view', { returning });
}
