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

  function reset() {
    samples.length = 0;
    clockOffset = undefined;
    lastRendered = -Infinity;
    displayedTime = undefined;
  }

  function push(time, view, receivedAt) {
    const previous = samples.at(-1);
    if (previous && time <= previous.time) return;
    const offset = receivedAt - time;
    // Follow the fastest recent arrivals without letting a burst of late packets shift playback.
    clockOffset = clockOffset === undefined ? offset : Math.min(offset, clockOffset + 0.35);
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
    displayedTime = target;

    const fraction = (target - earlier.time) / (later.time - earlier.time);
    const a = earlier.view;
    const b = later.view;
    const sameShuttle = a.shuttle && b.shuttle &&
      a.shuttle.shape === b.shuttle.shape && a.shuttle.size === b.shuttle.size;
    return {
      ...a,
      left: position(a.left, b.left, fraction),
      right: position(a.right, b.right, fraction),
      shuttle: sameShuttle ? {
        ...a.shuttle,
        ...position(a.shuttle, b.shuttle, fraction),
        angle: mix(a.shuttle.angle, b.shuttle.angle, fraction)
      } : a.shuttle
    };
  }

  return { reset, push, at, get displayedTime() { return displayedTime; } };
}
