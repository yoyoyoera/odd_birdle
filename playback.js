import { projectStrike } from './game.js';

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

  function reset() {
    samples.length = 0;
    clockOffset = undefined;
    lastRendered = -Infinity;
    displayedTime = undefined;
    latestStrike = undefined;
  }

  function push(time, view, receivedAt) {
    const previous = samples.at(-1);
    if (previous && time <= previous.time) return;
    const offset = receivedAt - time;
    // Follow the fastest recent arrivals without letting a burst of late packets shift playback.
    clockOffset = clockOffset === undefined ? offset : Math.min(offset, clockOffset + 0.35);
    if (view.strike && view.strike.flight !== latestStrike?.flight) latestStrike = view.strike;
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
    if (!later || target <= earlier.time || earlier.view.phase !== later.view.phase) return earlier.view;

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
      ...a,
      left: position(a.left, b.left, fraction),
      right: position(a.right, b.right, fraction),
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
