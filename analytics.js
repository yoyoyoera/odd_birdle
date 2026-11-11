import { cleanEvent } from './event-schema.js';

const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// Fire-and-forget anonymous counts; failures never touch the game.
export function track(name, details = {}) {
  const event = cleanEvent({ name, ...details });
  if (!event || local) return;
  try {
    const body = JSON.stringify(event);
    if (!navigator.sendBeacon?.('./event', body)) {
      fetch('./event', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Ignore.
  }
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
