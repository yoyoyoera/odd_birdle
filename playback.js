import { projectStrike, clamp, center, floor, racketRadius, width } from './game.js';

const bufferMs = 70;

function mix(a, b, fraction) {
  return a + (b - a) * fraction;
}

function position(a, b, fraction) {
  if (!a || !b) return a;
  return { x: mix(a.x, b.x, fraction), y: mix(a.y, b.y, fraction) };
}

export function createPlayback() {
  const samples = [];
  let clockOffset;
  let lastRendered = -Infinity;
  let displayedTime;
  let latestStrike;
  const rackets = { left: [], right: [] };
  const racketOffsets = { left: 0, right: 0 };

  function recordRacket(side, time, point) {
    const track = rackets[side];
    const last = track.at(-1);
    if (last && time < last.time) return;
    if (last?.time === time) track.pop();
    track.push({ time, point });
    if (track.length > 48) track.shift();
  }

  function racketAt(side, target) {
    const track = rackets[side];
    const index = track.findLastIndex(sample => sample.time <= target);
    if (index < 0) return undefined;
    const a = track[index];
    const b = track[index + 1];
    if (!a.point) return undefined;
    if (b?.point) return position(a.point, b.point, (target - a.time) / (b.time - a.time));
    const previous = track[index - 1];
    const gap = previous ? a.time - previous.time : 0;
    const age = target - a.time;
    // Short, bounded prediction bridges packet gaps. Ease to a stop rather than
    // snapping back to the last packet when movement stops or a packet is late.
    if (!previous?.point || gap <= 0 || gap > 150) return a.point;
    const horizon = 40;
    const travel = horizon * (1 - Math.exp(-Math.max(0, age) / horizon));
    let dx = (a.point.x - previous.point.x) * travel / gap;
    let dy = (a.point.y - previous.point.y) * travel / gap;
    const scale = Math.min(1, 18 / (Math.hypot(dx, dy) || 1));
    return {
      x: clamp(a.point.x + dx * scale, side === 'left' ? 0 : center + racketRadius,
        side === 'left' ? center - racketRadius : width),
      y: clamp(a.point.y + dy * scale, 0, floor)
    };
  }

  function withRackets(view, target) {
    return { ...view, left: racketAt('left', target), right: racketAt('right', target) };
  }

  function reset() {
    samples.length = 0;
    clockOffset = undefined;
    lastRendered = -Infinity;
    displayedTime = undefined;
    latestStrike = undefined;
    rackets.left.length = 0;
    rackets.right.length = 0;
    racketOffsets.left = racketOffsets.right = 0;
  }

  function push(time, view, receivedAt) {
    const previous = samples.at(-1);
    if (previous && time < previous.time) return;
    const offset = receivedAt - time;
    // Follow the fastest recent arrivals without letting a burst of late packets shift playback.
    clockOffset = clockOffset === undefined ? offset : Math.min(offset, clockOffset + 0.35);
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
    if (samples.length > 32) samples.shift();
  }

  function at(now) {
    if (!samples.length) return undefined;
    const target = Math.max(lastRendered, now - clockOffset - bufferMs);
    while (samples.length > 1 && samples[1].time <= target) samples.shift();
    const [earlier, later] = samples;
    lastRendered = Math.min(target, (later ?? earlier).time);
    displayedTime = earlier.time;
    if (!later || target <= earlier.time || earlier.view.phase !== later.view.phase) {
      return withRackets(earlier.view, lastRendered);
    }

    const strike = latestStrike;
    const fraction = (target - earlier.time) / (later.time - earlier.time);
    const a = earlier.view;
    const b = later.view;
    const sameShuttle = a.shuttle && b.shuttle &&
      a.shuttle.flight === b.shuttle.flight && a.shuttle.shape === b.shuttle.shape && a.shuttle.size === b.shuttle.size;
    const followsStrike = a.shuttle && b.shuttle && strike && target >= strike.time &&
      strike.fromFlight === a.shuttle.flight &&
      (strike.fromFlight === b.shuttle.flight || strike.flight === b.shuttle.flight);
    if (sameShuttle || followsStrike) displayedTime = target;
    return {
      ...withRackets(a, target),
      shuttle: followsStrike ? {
        ...projectStrike(strike.pose, strike.motion, (target - strike.time) / 1000),
        flight: strike.flight,
        canHit: target - strike.time >= 140
      } : sameShuttle ? {
        ...a.shuttle,
        ...position(a.shuttle, b.shuttle, fraction),
        angle: mix(a.shuttle.angle, b.shuttle.angle, fraction)
      } : a.shuttle
    };
  }

  return { reset, push, at, get displayedTime() { return displayedTime; } };
}
