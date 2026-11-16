// How good this player's connection is, as 1 to 3 bars, from the round trip (ms) and how late packets run
// (p95, ms). Values are smoothed over a few seconds, and the bars only get better once things are clearly
// better, so they never flicker around a limit. Pure maths; the screen and the sending are done elsewhere.

// A level is at most this bad to count as 3 or 2 bars; worse is 1.
const limits = { three: { rtt: 80, late: 60 }, two: { rtt: 180, late: 150 } };
// Moving up a bar needs a clear margin below the limit.
const margin = 0.8;
const smoothing = 0.35;
const noticeShowMs = 3500;
const noticeGapMs = 20000;

export const barsFor = (rtt, late, current = 3) => {
  const raw = rtt < limits.three.rtt && late < limits.three.late ? 3 : rtt < limits.two.rtt && late < limits.two.late ? 2 : 1;
  if (raw <= current) return raw;
  // Better than before: only believe it when it is clearly under the limit of the bar above.
  const limit = current === 1 ? limits.two : limits.three;
  return rtt < limit.rtt * margin && late < limit.late * margin ? current + 1 : current;
};

export function createLinkQuality() {
  let rtt;
  let late = 0;
  let level = 3;
  let noticeUntil = -Infinity;
  let lastNotice = -Infinity;
  const mixIn = (old, value) => old === undefined ? value : old + smoothing * (value - old);
  return {
    reset() {
      rtt = undefined; late = 0; level = 3; noticeUntil = -Infinity; lastNotice = -Infinity;
    },
    // One measurement: the round trip just measured and the current lateness (p95).
    observe(roundTrip, lateness, now) {
      if (!Number.isFinite(roundTrip) || roundTrip < 0) return;
      rtt = mixIn(rtt, roundTrip);
      late = mixIn(late, Number.isFinite(lateness) && lateness > 0 ? lateness : 0);
      const next = barsFor(rtt, late, level);
      if (next === 1 && level > 1 && now - lastNotice >= noticeGapMs) {
        lastNotice = now;
        noticeUntil = now + noticeShowMs;
      }
      level = next;
    },
    get known() { return rtt !== undefined; },
    get level() { return level; },
    get rtt() { return rtt === undefined ? undefined : Math.round(rtt); },
    // "Unstable connection" shows briefly when the link drops to one bar, and not again for a while.
    notice(now) { return now < noticeUntil; },
    // What the opponent is told: a bar count and a round trip, nothing else.
    report() { return rtt === undefined ? undefined : { level, rtt: Math.min(9999, Math.round(rtt)) }; }
  };
}

// What came in from the opponent, cleaned up (or undefined when it is not a sensible report).
export function cleanReport(message) {
  const level = message?.level;
  const roundTrip = message?.rtt;
  if (![1, 2, 3].includes(level) || !Number.isFinite(roundTrip) || roundTrip < 0 || roundTrip > 9999) return undefined;
  return { level, rtt: Math.round(roundTrip) };
}
