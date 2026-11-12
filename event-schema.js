// Anonymous play events. Only these names and values are ever stored: no IDs,
// no IP addresses, no user agents.
export const events = {
  page_view: { returning: ['yes', 'no'] },
  game_start: { mode: ['cpu', 'online'], level: ['1', '2', '3', '4', '5', 'random'], via: ['create', 'code', 'link'] },
  game_finish: { mode: ['cpu', 'online'], level: ['1', '2', '3', '4', '5'], result: ['win', 'lose'] },
  rematch: { mode: ['cpu', 'online'] },
  room_create: {},
  link_copy: {},
  // Sent once a minute while the game is on screen, to count people playing at the same time.
  heartbeat: { mode: ['menu', 'cpu', 'online'] }
};
export const fields = ['mode', 'level', 'via', 'result', 'returning'];

// Returns a clean event or undefined when anything is off-list.
export function cleanEvent(input) {
  if (!input || typeof input !== 'object') return undefined;
  const allowed = Object.hasOwn(events, input.name) ? events[input.name] : undefined;
  if (!allowed) return undefined;
  const event = { name: input.name };
  for (const field of fields) {
    const value = input[field];
    if (value === undefined) continue;
    if (!allowed[field]?.includes(String(value))) return undefined;
    event[field] = String(value);
  }
  return event;
}
