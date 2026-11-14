// The victory confetti: when a match ends, diamonds in the game's own colours drift down over the winner's half
// of the court. Pure maths (no drawing, no game state), so it can be tested.

const pieceCount = 80;
const spreadMs = 2600;
export const confettiColors = ['ink', 'net', 'line', '#dcb49c', '#a9d678'];

export function launchConfetti(side, now, random = Math.random) {
  const from = side === 'left' ? 24 : 466;
  const pieces = [];
  let end = now;
  for (let i = 0; i < pieceCount; i++) {
    const piece = {
      start: now + random() * spreadMs, x: from + random() * 410, speed: 80 + random() * 90,
      sway: 8 + random() * 20, swayRate: 1.2 + random() * 1.8, phase: random() * Math.PI * 2,
      spin: 2 + random() * 4, tilt: random() * Math.PI, size: 5 + random() * 5,
      color: confettiColors[Math.floor(random() * confettiColors.length)]
    };
    end = Math.max(end, piece.start + (520 / piece.speed) * 1000);
    pieces.push(piece);
  }
  return { pieces, end };
}

// What to draw at `now`, or undefined once every piece has fallen out of sight.
export function confettiAt(show, now) {
  if (!show || now > show.end) return undefined;
  const out = [];
  for (const p of show.pieces) {
    const seconds = (now - p.start) / 1000;
    if (seconds < 0) continue;
    const y = -12 + p.speed * seconds;
    if (y > 512) continue;
    out.push({
      x: p.x + Math.sin(p.phase + seconds * p.swayRate) * p.sway, y,
      // The piece turns over as it falls: its width shrinks to a sliver and back.
      width: Math.abs(Math.cos(p.phase + seconds * p.spin)) * 0.75 + 0.2,
      angle: p.tilt + Math.sin(seconds * p.swayRate) * 0.5, size: p.size,
      alpha: Math.min(1, seconds * 3), color: p.color
    });
  }
  return out;
}
