import { clamp, floor, projectStrike, shuttleOutline } from './game.js';

// The wait before drawing a snapshot adapts to how unevenly packets arrive:
// steady wired links stay near the floor, Wi-Fi bursts raise it, and a phone on mobile data
// (where p95 lateness can pass 100ms) may need a good deal more.
export const minBufferMs = 50;
export const maxBufferMs = 250;
const startBufferMs = 70;
// Cover the lateness of 85% of packets (+8ms): a good balance on mobile data, where covering 95%
// would add ~60ms of delay for little extra smoothness (the rest is bridged by the short guess).
const bufferPercentile = 0.85;
const bufferMargin = 8;
const latenessWindowMs = 2000;
// Growing the wait slows playback briefly (never below ~88% speed, so it does not read as slow
// motion); shrinking it speeds playback up a little. Whatever the buffer cannot cover yet is
// bridged by the short guess below.
const growPerMs = 0.12;
const shrinkPerMs = 0.03;
// When the next snapshot is late, keep things moving for a short while.
const birdExtrapolateMs = 180;
const racketExtrapolateMs = 120;
// Differences between a guess and the real snapshot fade out instead of jumping.
const blendMs = 70;
const snapDistance = 80;
// A hit starts a new flight: the bird carries on from where it was drawn and eases onto it
// (the hitter's swing reaches us ~100ms late, so the new path is already ahead). A move
// this big is a new serve and is not blended.
const hitBlendMs = 90;
const hitBlendMax = 170;

// Approach the buffered clock along the confirmed flight, without rewinding it.
export function followStrikeClock(age, targetAge, elapsed) {
  const dt = Math.max(0, elapsed);
  return age + Math.max(dt * 0.5, Math.min(targetAge - age, dt * 1.5));
}

function mix(a, b, fraction) {
  return a + (b - a) * fraction;
}

function position(a, b, fraction) {
  if (!a || !b) return a;
  return { x: mix(a.x, b.x, fraction), y: mix(a.y, b.y, fraction) };
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

// Keeps a drawn point continuous when its source switches from a guess to data.
function createSmoother() {
  let shown;
  let offset = { x: 0, y: 0 };
  let fadeMs = blendMs;
  return {
    reset() {
      shown = undefined;
      offset = { x: 0, y: 0 };
      fadeMs = blendMs;
    },
    // basis names the snapshot the point came from; a new basis after a guess is a correction.
    apply(raw, identity, guessed, dt, basis) {
      if (!raw) {
        shown = undefined;
        return raw;
      }
      if (!shown) {
        offset = { x: 0, y: 0 };
      } else if (shown.identity !== identity) {
        const expected = { x: shown.x + shown.vx * dt, y: shown.y + shown.vy * dt };
        offset = { x: expected.x - raw.x, y: expected.y - raw.y };
        fadeMs = hitBlendMs;
        if (Math.hypot(offset.x, offset.y) > hitBlendMax) offset = { x: 0, y: 0 };
      } else if (shown.guessed && (!guessed || basis !== shown.basis)) {
        // Continue from where the guess was heading, then ease onto the data.
        const expected = { x: shown.x + shown.vx * dt, y: shown.y + shown.vy * dt };
        offset = { x: expected.x - raw.x, y: expected.y - raw.y };
        fadeMs = blendMs;
        if (Math.hypot(offset.x, offset.y) > snapDistance) offset = { x: 0, y: 0 };
      } else {
        const fade = Math.exp(-dt / fadeMs);
        offset = { x: offset.x * fade, y: offset.y * fade };
      }
      const x = raw.x + offset.x;
      const y = raw.y + offset.y;
      const vx = shown && shown.identity === identity && dt > 0 ? (x - shown.x) / dt : 0;
      const vy = shown && shown.identity === identity && dt > 0 ? (y - shown.y) / dt : 0;
      shown = { identity, guessed, basis, x, y, vx, vy };
      return { ...raw, x, y };
    }
  };
}

export function createPlayback() {
  const samples = [];
  let previousSample;
  let clockOffset;
  let lastRendered = -Infinity;
  let displayedTime;
  let latestStrike;
  let latestTime = -Infinity;
  let bufferMs = startBufferMs;
  let lastNow;
  // For the ?debug=net overlay: how playback is coping.
  const counters = { frames: 0, starved: 0, rate: 1 };
  const lateness = [];
  const rackets = { left: [], right: [] };
  const racketOffsets = { left: 0, right: 0 };
  const racketClocks = { left: undefined, right: undefined };
  const smoothers = { shuttle: createSmoother(), left: createSmoother(), right: createSmoother() };

  function recordRacket(side, time, point) {
    const track = rackets[side];
    const last = track.at(-1);
    if (last && time < last.time) return;
    if (last?.time === time) track.pop();
    track.push({ time, point });
    if (track.length > 48) track.shift();
  }

  // Each racket follows its own data on a smooth clock: the opponent's inputs
  // run a little behind the bird, and jumping to every packet looks jerky.
  function racketClock(side, target, dt) {
    const latest = rackets[side].at(-1)?.time;
    if (latest === undefined) return target;
    const wanted = Math.min(target, latest);
    const clock = racketClocks[side];
    const next = clock === undefined || wanted - clock > 300 || wanted < clock - 300
      ? wanted
      // Catch up quickly when well behind (e.g. a hit just arrived) so the racket meets the bird.
      : Math.min(wanted, clock + Math.max(dt * 0.5, Math.min(wanted - clock, dt * (wanted - clock > 25 ? 2 : 1.5))));
    racketClocks[side] = Math.max(clock ?? -Infinity, next);
    return racketClocks[side];
  }

  // Returns the racket and whether it is a short guess past the last sample.
  function racketAt(side, sceneTarget, starvedFor, dt) {
    const track = rackets[side];
    const target = racketClock(side, sceneTarget, dt);
    const index = track.findLastIndex(sample => sample.time <= target);
    if (index < 0) return {};
    const a = track[index];
    const b = track[index + 1];
    if (!a.point) return {};
    if (b?.point) return { point: position(a.point, b.point, (target - a.time) / (b.time - a.time)), basis: a.time };
    const before = track[index - 1];
    // Only guess when snapshots stopped arriving; a racket that is simply still stays put.
    if (starvedFor <= 0 || !before?.point || a.time <= before.time) return { point: a.point, basis: a.time };
    const ahead = Math.min(starvedFor, racketExtrapolateMs);
    const vx = (a.point.x - before.point.x) / (a.time - before.time);
    const vy = (a.point.y - before.point.y) / (a.time - before.time);
    return { point: { ...a.point, x: a.point.x + vx * ahead, y: a.point.y + vy * ahead }, guessed: true, basis: a.time };
  }

  function withRackets(view, target, starvedFor, dt) {
    const result = { ...view };
    for (const side of ['left', 'right']) {
      const { point, guessed = false, basis } = racketAt(side, target, starvedFor, dt);
      result[side] = smoothers[side].apply(point, 'racket', guessed, dt, basis);
    }
    return result;
  }

  function reset() {
    samples.length = 0;
    previousSample = undefined;
    clockOffset = undefined;
    lastRendered = -Infinity;
    displayedTime = undefined;
    latestStrike = undefined;
    latestTime = -Infinity;
    bufferMs = startBufferMs;
    lastNow = undefined;
    Object.assign(counters, { frames: 0, starved: 0, rate: 1 });
    lateness.length = 0;
    rackets.left.length = 0;
    rackets.right.length = 0;
    racketOffsets.left = racketOffsets.right = 0;
    racketClocks.left = racketClocks.right = undefined;
    for (const smoother of Object.values(smoothers)) smoother.reset();
  }

  function push(time, view, receivedAt) {
    const previous = samples.at(-1);
    if (previous && time < previous.time) return;
    const offset = receivedAt - time;
    // Follow the fastest recent arrivals without letting a burst of late packets shift playback.
    clockOffset = clockOffset === undefined ? offset : Math.min(offset, clockOffset + 0.35);
    lateness.push({ receivedAt, late: offset - clockOffset });
    while (lateness.length && lateness[0].receivedAt < receivedAt - latenessWindowMs) lateness.shift();
    latestTime = Math.max(latestTime, time);
    if (view.strike && view.strike.flight !== latestStrike?.flight) {
      latestStrike = view.strike;
      if (rackets[latestStrike.side] && latestStrike.racket) {
        recordRacket(latestStrike.side, latestStrike.time, latestStrike.racket);
      }
    }
    for (const side of ['left', 'right']) {
      const point = view[side];
      // Inputs and strikes use the same historical scene clock. Receipt time
      // would delay the racket while the shuttle already follows the hit.
      if (Number.isFinite(point?.seenTime)) racketOffsets[side] = time - point.seenTime;
      recordRacket(side, time - racketOffsets[side], point);
    }
    if (previous?.time === time) samples.pop();
    samples.push({ time, view });
    if (samples.length > 32) previousSample = samples.shift();
  }

  function updateBuffer(dt) {
    const wanted = clamp(percentile(lateness.map(entry => entry.late), bufferPercentile) + bufferMargin, minBufferMs, maxBufferMs);
    if (wanted > bufferMs) bufferMs = Math.min(wanted, bufferMs + dt * growPerMs);
    else bufferMs = Math.max(wanted, bufferMs - dt * shrinkPerMs);
  }

  // Short guess for a bird whose next snapshot has not arrived yet.
  function extrapolateShuttle(sample, target) {
    const shuttle = sample.view.shuttle;
    const until = Math.min(target, sample.time + birdExtrapolateMs);
    const strike = latestStrike;
    if (strike && strike.flight === shuttle.flight && until >= strike.time) {
      return { shuttle: stayAboveFloor({ ...shuttle, ...projectStrike(strike.pose, strike.motion, (until - strike.time) / 1000, strike.force),
        flight: strike.flight, canHit: shuttle.canHit }), until };
    }
    const before = previousSample;
    const old = before?.view.shuttle;
    if (!old || old.flight !== shuttle.flight || before.time >= sample.time) return { shuttle, until: sample.time };
    const span = sample.time - before.time;
    const ahead = until - sample.time;
    const guess = { ...shuttle,
      x: shuttle.x + (shuttle.x - old.x) / span * ahead,
      y: shuttle.y + (shuttle.y - old.y) / span * ahead,
      angle: shuttle.angle + (shuttle.angle - old.angle) / span * ahead };
    return { shuttle: stayAboveFloor(guess), until };
  }

  // A guess must never carry the bird through the floor (a landing sample arrives late).
  function stayAboveFloor(pose) {
    const bottom = Math.max(...shuttleOutline(pose).flat().map(point => point.y));
    return { ...pose, y: Math.min(pose.y, floor - bottom) };
  }

  function finish(view, identity, guessed, dt, basis) {
    if (!view.shuttle) {
      smoothers.shuttle.apply(undefined);
      return view;
    }
    return { ...view, shuttle: smoothers.shuttle.apply(view.shuttle, identity, guessed, dt, basis) };
  }

  function at(now) {
    if (!samples.length) return undefined;
    const dt = lastNow === undefined ? 0 : clamp(now - lastNow, 0, 100);
    lastNow = now;
    updateBuffer(dt);
    const target = Math.max(lastRendered, now - clockOffset - bufferMs);
    while (samples.length > 1 && samples[1].time <= target) previousSample = samples.shift();
    const [earlier, later] = samples;
    const renderedBefore = lastRendered;
    lastRendered = Math.min(target, (later ?? earlier).time);
    displayedTime = earlier.time;
    const starvedFor = target - latestTime;
    counters.frames++;
    if (starvedFor > 0) counters.starved++;
    if (dt > 0 && Number.isFinite(renderedBefore)) counters.rate += ((lastRendered - renderedBefore) / dt - counters.rate) * 0.05;
    const a = earlier.view;

    if (!later && starvedFor > 0 && a.phase === 'live' && a.shuttle && !a.frozen) {
      const { shuttle, until } = extrapolateShuttle(earlier, target);
      displayedTime = until;
      return finish({ ...withRackets(a, target, starvedFor, dt), shuttle }, shuttle.flight, until > earlier.time, dt, earlier.time);
    }
    if (!later || target <= earlier.time || a.phase !== later.view.phase) {
      return finish(withRackets(a, lastRendered, starvedFor, dt), a.shuttle?.flight, false, dt, earlier.time);
    }

    const strike = latestStrike;
    const fraction = (target - earlier.time) / (later.time - earlier.time);
    const b = later.view;
    const sameShuttle = a.shuttle && b.shuttle &&
      a.shuttle.flight === b.shuttle.flight && a.shuttle.shape === b.shuttle.shape && a.shuttle.size === b.shuttle.size;
    const followsStrike = a.shuttle && b.shuttle && strike && target >= strike.time &&
      strike.fromFlight === a.shuttle.flight &&
      (strike.fromFlight === b.shuttle.flight || strike.flight === b.shuttle.flight);
    if (sameShuttle || followsStrike) displayedTime = target;
    const shuttle = followsStrike ? stayAboveFloor({
      ...projectStrike(strike.pose, strike.motion, (target - strike.time) / 1000, strike.force),
      flight: strike.flight,
      canHit: target - strike.time >= 140
    }) : sameShuttle ? {
      ...a.shuttle,
      ...position(a.shuttle, b.shuttle, fraction),
      angle: mix(a.shuttle.angle, b.shuttle.angle, fraction)
    } : a.shuttle;
    return finish({
      ...withRackets(a, target, 0, dt),
      netTop: Number.isFinite(a.netTop) && Number.isFinite(b.netTop)
        ? mix(a.netTop, b.netTop, fraction) : a.netTop,
      shuttle
    }, shuttle?.flight, false, dt, earlier.time);
  }

  return {
    reset, push, at,
    get displayedTime() { return displayedTime; },
    get bufferMs() { return bufferMs; },
    // How playback is coping: buffer (ms), how late packets run (p95, ms), playback speed (1 = real
    // time), and how many frames had to be guessed because the next snapshot had not arrived.
    get stats() {
      return {
        bufferMs, jitterP95: percentile(lateness.map(entry => entry.late), 0.95),
        rate: counters.rate, frames: counters.frames, starved: counters.starved
      };
    }
  };
}
