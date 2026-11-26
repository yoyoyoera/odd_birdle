// Two players on one device (the app's 2 PLAYERS mode): the screen is split into two equal halves, the left half moves the
// left racket and the right half the right one, each by how far its finger slides (the same feel as the one-player pad).
// One finger per half; a second finger in a half that already has one is ignored.
export function createDuoTouch({ screenWidth, scale, center, width, floor, racketRadius, startY = 280 }) {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fingers = new Map();   // pointer id -> { side, x, y }
  const rackets = {};          // side -> { x, y }, kept between touches

  const reset = () => {
    fingers.clear();
    rackets.left = { x: center / 2, y: startY };
    rackets.right = { x: center * 1.5, y: startY };
  };
  reset();

  const sideAt = x => (x < screenWidth() / 2 ? 'left' : 'right');
  const copy = side => ({ side, racket: { ...rackets[side] } });

  return {
    reset,
    // A finger lands: it takes the racket of the half it is in, without moving it.
    down(id, x, y) {
      const side = sideAt(x);
      if ([...fingers.values()].some(finger => finger.side === side)) return undefined;
      fingers.set(id, { side, x, y });
      return copy(side);
    },
    // The finger slides: the racket moves by that distance (times the touch speed), kept inside its own half.
    move(id, x, y) {
      const finger = fingers.get(id);
      if (!finger) return undefined;
      const { side } = finger;
      const factor = scale();
      const racket = rackets[side];
      racket.x = side === 'left'
        ? clamp(racket.x + (x - finger.x) * factor, 0, center - racketRadius)
        : clamp(racket.x + (x - finger.x) * factor, center + racketRadius, width);
      racket.y = clamp(racket.y + (y - finger.y) * factor, 0, floor);
      finger.x = x;
      finger.y = y;
      return copy(side);
    },
    up(id) { return fingers.delete(id); },
    has: id => fingers.has(id)
  };
}
