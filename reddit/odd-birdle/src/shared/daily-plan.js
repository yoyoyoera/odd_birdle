// Which challenge is the daily one, for any date. Pure and import-free, because the Reddit app's server uses this same
// file to decide (the browser only displays): the server is the one that says what today's challenge is.
// Dates are UTC days written "YYYY-MM-DD"; the day changes at 00:00 UTC (09:00 in Korea).
export const epochDate = '2026-11-19'; // daily #1
export const challengeKeys = ['windy', 'sudden', 'smash', 'five', 'post', 'net', 'shrink', 'nowarning'];
export const challengeNames = { windy: 'Windy Day', sudden: 'Sudden Death', smash: 'Smash Fest', five: 'Five in a Row', post: 'The Post', net: 'Moving Net', shrink: 'Shrinking Bird', nowarning: 'No Warning' };
export const maxAttempts = key => key === 'sudden' ? 1 : 5;
// Points the player must reach (the stage rule behind each key; Five in a Row starts 0:4 down and needs five straight).
export const targetPoints = { windy: 5, sudden: 1, smash: 5, five: 5, post: 5, net: 7, shrink: 5, nowarning: 5 };
const cpuLevels = [2, 3, 4];

const dayMs = 24 * 60 * 60 * 1000;
export const utcDate = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
export const dayIndex = date => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(epochDate + 'T00:00:00Z')) / dayMs);

function seededOrder(seed) {
  let state = (Math.imul(seed + 7919, 2654435761) >>> 0) || 1;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const order = [...challengeKeys];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Every challenge comes up once in each run of eight days, in an order that changes run to run, and the last one of a
// run never opens the next.
function keyForCycle(cycle, slot) {
  const order = seededOrder(cycle);
  if (cycle > 0 && order[0] === seededOrder(cycle - 1)[challengeKeys.length - 1]) order.push(order.shift());
  return order[slot];
}

export function dailyFor(date) {
  const index = dayIndex(date);
  const cycle = Math.floor(index / challengeKeys.length);
  const slot = ((index % challengeKeys.length) + challengeKeys.length) % challengeKeys.length;
  const key = keyForCycle(cycle, slot);
  // The CPU's level changes with the day too, so the same twist is not the same difficulty twice in a row.
  const cpuLevel = cpuLevels[(Math.imul(index + 31, 2246822519) >>> 0) % cpuLevels.length];
  return { date, number: index + 1, key, cpuLevel, attempts: maxAttempts(key), points: targetPoints[key] };
}

// Shortest time a real win of this challenge can take: the 3-2-1 and a serve, then a few seconds for every point.
export const minimumSeconds = points => 3 + points * 3;
