import { center, floor, shuttleOutline } from './game.js';

// Small screen-only touches. They read what is already drawn (like the sound cues), so CPU and
// online play get them alike and nothing about the match itself changes.
export const juiceKeys = ['hitstop', 'squash', 'dust', 'scorePop', 'hint', 'record'];
export const juiceTiming = { hitstopMs: 40, squashMs: 140, dustMs: 280, popMs: 220, hintFadeMs: 300 };
// Shuttle speed (units/s) right after a hit that counts as a strong one.
export const strongHitSpeed = 1000;
// Two flashes this close together are one hit (local prediction, then the server's copy).
const sameHitMs = 130;

const sideOf = x => (x < center ? 'left' : 'right');
const bottomOf = shuttle => shuttle.y + Math.max(...shuttleOutline(shuttle).flat().map(point => point.y));

// Turns successive views into events: hit (with direction and speed), landing and score change.
export function createJuiceTracker() {
  let previous;
  let lastHit = -Infinity;
  let pendingHit;
  return {
    reset() {
      previous = undefined;
      pendingHit = undefined;
    },
    update(view, now) {
      const events = [];
      if (!view) return events;
      const shuttle = view.shuttle;
      const flash = view.flash ?? 0;
      if (previous) {
        // The hit is measured on the next frame, once the shuttle has moved.
        if (pendingHit && shuttle && previous.shuttle && now > previous.time) {
          const dx = shuttle.x - previous.shuttle.x;
          const dy = shuttle.y - previous.shuttle.y;
          const speed = Math.hypot(dx, dy) / ((now - previous.time) / 1000);
          events.push({ type: 'hit', side: pendingHit.side, angle: Math.atan2(dy, dx), speed, strong: speed >= strongHitSpeed });
          pendingHit = undefined;
        } else if (pendingHit && (!shuttle || now - pendingHit.time > 100)) {
          pendingHit = undefined;
        }
        if (view.phase === 'live' && shuttle && flash > previous.flash + 0.05 && now - lastHit > sameHitMs) {
          lastHit = now;
          pendingHit = { time: now, side: sideOf(shuttle.x) };
        }
        if (shuttle && previous.shuttle && previous.bottom < floor - 1 && bottomOf(shuttle) >= floor - 1) {
          events.push({ type: 'land', x: shuttle.x });
        }
        if (view.score && previous.score &&
            view.score.left + view.score.right > previous.score.left + previous.score.right) {
          events.push({ type: 'score' });
        }
      }
      previous = {
        time: now, flash, shuttle: shuttle && { x: shuttle.x, y: shuttle.y },
        bottom: shuttle ? bottomOf(shuttle) : Infinity, score: view.score && { ...view.score }
      };
      return events;
    }
  };
}

// How flat a racket is `elapsed` ms after a hit: 0 (round) to `depth` (flattest), back to 0.
export function squashAmount(elapsed, depth = 0.24) {
  if (!(elapsed >= 0) || elapsed >= juiceTiming.squashMs) return 0;
  const t = elapsed / juiceTiming.squashMs;
  return depth * (1 - t) * (1 - t);
}

// Two or three ink dots kicked up where the shuttle lands.
export function makeDust(x, now, random = Math.random) {
  const count = 2 + Math.floor(random() * 2);
  return Array.from({ length: count }, (_, i) => {
    const direction = (i % 2 ? 1 : -1) * (count === 3 && i === 2 ? 0.3 : 1);
    return {
      x: x + direction * 6, y: floor, born: now,
      vx: direction * (50 + random() * 70), vy: -(110 + random() * 70), size: 2 + random() * 1.2
    };
  });
}

export function dustAt(speck, now) {
  const t = (now - speck.born) / 1000;
  if (t < 0 || t * 1000 >= juiceTiming.dustMs) return undefined;
  return {
    x: speck.x + speck.vx * t, y: Math.min(floor, speck.y + speck.vy * t + 450 * t * t),
    size: speck.size, alpha: 1 - (t * 1000) / juiceTiming.dustMs
  };
}

// Local records. Storage can be missing or blocked: then nothing is remembered.
const hintKey = 'oddbirdle-hint-done';
const winsKey = 'oddbirdle-cpu-wins';

export function hintSeen(storage) {
  try {
    return storage?.getItem(hintKey) === '1';
  } catch {
    return false;
  }
}

export function markHintSeen(storage) {
  try {
    storage?.setItem(hintKey, '1');
  } catch {
    // This visit only.
  }
}

export function cpuWins(storage) {
  try {
    const levels = JSON.parse(storage?.getItem(winsKey) ?? '[]');
    return Array.isArray(levels) ? levels.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

// Notes a win against a CPU level; true the first time that level is beaten.
export function noteCpuWin(storage, level) {
  if (!Number.isInteger(level)) return false;
  const levels = cpuWins(storage);
  if (levels.includes(level)) return false;
  try {
    storage?.setItem(winsKey, JSON.stringify([...levels, level].sort()));
  } catch {
    // Still the first win this visit.
  }
  return true;
}

export function resetJuiceRecords(storage) {
  try {
    storage?.removeItem(hintKey);
    storage?.removeItem(winsKey);
  } catch {
    // Nothing stored.
  }
}
