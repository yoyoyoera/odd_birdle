import { cleanEvent } from './event-schema.js';
import { serverBase } from './portal.js';

const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// Fire-and-forget anonymous counts; failures never touch the game.
export function track(name, details = {}) {
  const event = cleanEvent({ name, ...details });
  if (!event || local) return;
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
