// The victory fireworks: when a match ends, rockets fly in from the winner's corners, climb over the winner's
// half of the court and burst into sparks. Pure maths (no drawing, no game state), so it can be tested.

const rocketCount = 10;
const gapMs = 430;
const flightMs = 700;
const gravity = 300;
export const fireworkColors = ['#c9774f', '#d9b25f', '#dcb49c', 'ink', 'net', 'line'];

export function launchFireworks(side, now, random = Math.random) {
  const outer = side === 'left' ? 14 : 886;
  const inward = side === 'left' ? 1 : -1;
  const rockets = [];
  for (let i = 0; i < rocketCount; i++) {
    const fromTop = i % 2 === 1;
    const burstX = outer + inward * (110 + random() * 240);
    const burstY = 200 + random() * 130;
    const spark = [];
    const count = 22 + Math.floor(random() * 10);
    const color = fireworkColors[Math.floor(random() * fireworkColors.length)];
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + random() * 0.3;
      const speed = 90 + random() * 120;
      spark.push({ vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 900 + random() * 500 });
    }
    rockets.push({
      start: now + i * gapMs + random() * 120, fromX: outer, fromY: fromTop ? 230 : 436,
      burstX, burstY, color, spark
    });
  }
  return { rockets, end: now + (rocketCount - 1) * gapMs + 120 + flightMs + 1500 };
}

// What to draw at `now`: climbing rockets and flying sparks, or undefined once the show is over.
export function fireworksAt(show, now) {
  if (!show || now > show.end) return undefined;
  const flying = [];
  const sparks = [];
  for (const r of show.rockets) {
    const t = now - r.start;
    if (t < 0) continue;
    if (t < flightMs) {
      const p = 1 - (1 - t / flightMs) ** 2;
      flying.push({ x: r.fromX + (r.burstX - r.fromX) * p, y: r.fromY + (r.burstY - r.fromY) * p, color: r.color });
      continue;
    }
    const age = t - flightMs;
    for (const s of r.spark) {
      if (age > s.life) continue;
      const sec = age / 1000;
      sparks.push({
        x: r.burstX + s.vx * sec, y: r.burstY + s.vy * sec + 0.5 * gravity * sec * sec,
        alpha: 1 - (age / s.life) ** 2, color: r.color
      });
    }
  }
  return { flying, sparks };
}
