// How good this player's connection is, as 1 to 3 bars, from the round trip (ms), how late packets run (p95, ms)
// and how many frames had to be drawn from a guess because the next update was late (percent, the part players
// actually feel on Wi-Fi: a fine ping can still hide a jittery link). Values are smoothed over a few seconds, and
// the bars only get better once things are clearly better, so they never flicker around a limit. Pure maths.

// A level is at most this bad to count as 3 or 2 bars; worse is 1. (Set from a real Wi-Fi match that felt bad:
// ping under 50 ms, lateness 30-80 ms, 3-10 % guessed frames. That has to read as poor.)
const limits = { three: { rtt: 60, late: 30, guess: 1 }, two: { rtt: 150, late: 70, guess: 3 } };
// Moving up a bar needs a clear margin below the limit.
const margin = 0.8;
const smoothing = 0.35;

const within = (limit, rtt, late, guess, scale = 1) =>
  rtt < limit.rtt * scale && late < limit.late * scale && guess < limit.guess * scale;

export const barsFor = (rtt, late, guess = 0, current = 3) => {
  const raw = within(limits.three, rtt, late, guess) ? 3 : within(limits.two, rtt, late, guess) ? 2 : 1;
  if (raw <= current) return raw;
  // Better than before: only believe it when it is clearly under the limit of the bar above.
  return within(current === 1 ? limits.two : limits.three, rtt, late, guess, margin) ? current + 1 : current;
};

export function createLinkQuality() {
  let rtt;
  let late = 0;
  let guess = 0;
  let level = 3;
  const mixIn = (old, value) => old === undefined ? value : old + smoothing * (value - old);
  const positive = value => Number.isFinite(value) && value > 0 ? value : 0;
  return {
    reset() {
      rtt = undefined; late = 0; guess = 0; level = 3;
    },
    // One measurement: the round trip just measured, the current lateness (p95) and the share of guessed frames.
    observe(roundTrip, lateness, guessedPct) {
      if (!Number.isFinite(roundTrip) || roundTrip < 0) return;
      rtt = mixIn(rtt, roundTrip);
      late = mixIn(late, positive(lateness));
      guess = mixIn(guess, positive(guessedPct));
      level = barsFor(rtt, late, guess, level);
    },
    get known() { return rtt !== undefined; },
    get level() { return level; },
    get rtt() { return rtt === undefined ? undefined : Math.round(rtt); }
  };
}
