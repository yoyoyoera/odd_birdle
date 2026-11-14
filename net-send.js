// Sends the player's racket to the server. A mouse moves in small steps and a wired link can take
// every one; a touch screen reports a move many times a frame, so on a phone these are bundled:
// at most one message per interval, always the newest position. Lifting the finger goes out at once.
export function createRacketSender(transmit, { interval = () => 0, now = () => performance.now(), later = setTimeout, cancel = clearTimeout } = {}) {
  let lastSent = -Infinity;
  let pending;
  let timer;

  function flush() {
    timer = undefined;
    if (!pending) return;
    const message = pending;
    pending = undefined;
    lastSent = now();
    transmit(message);
  }

  return {
    push(message) {
      const wait = interval();
      if (message.input === null || wait <= 0) {
        // Whatever was waiting is older than this.
        pending = undefined;
        if (timer !== undefined) cancel(timer);
        timer = undefined;
        lastSent = now();
        transmit(message);
        return;
      }
      const since = now() - lastSent;
      if (since >= wait && timer === undefined) {
        lastSent = now();
        transmit(message);
        return;
      }
      pending = message;
      if (timer === undefined) timer = later(flush, Math.max(0, wait - since));
    },
    flush
  };
}
