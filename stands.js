// Spectator stands along the top of the court: a few rows of people in one colour, only their lightness
// differing, so the crowd stays calm behind the play. Every match gets its own crowd (how many seats are
// taken, who sits where). The crowd looks at the shuttle all the time, hidden or not, which is how a
// player can still follow it while INVISIBLE hides it. Drawing only; nothing here changes the game.

export const standsBottom = 178;
const rows = [[44, 0.82], [72, 0.92], [100, 1.02], [128, 1.12]];

const channel = (hex, at) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
export function mix(from, to, amount) {
  const part = at => Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount).toString(16).padStart(2, '0');
  return '#' + part(0) + part(1) + part(2);
}

function randomFrom(seed) {
  let state = (Math.floor(seed) % 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

export function makeStands(seed = Math.random() * 2147483646) {
  const random = randomFrom(seed);
  const fill = 0.3 + random() * 0.7;
  const people = [];
  rows.forEach(([y, s], row) => {
    for (let x = 60 + (row % 2) * 26 + random() * 10; x < 850; x += 50 * s + random() * 14) {
      const person = {
        x: x + (random() - 0.5) * 6, y, s, row, shade: random() < 0.5 ? 0 : 1, face: random() < 0.5 ? 0 : 1,
        hair: Math.floor(random() * 3), style: random(), hat: random() < 0.1, fan: random() < 0.6, delay: random() * 0.18
      };
      const seated = random() < fill;
      if (seated && Math.abs(x - 450) >= 30) people.push(person);
    }
  });
  return { people, fill };
}

const tonesFor = palette => {
  const m = amount => mix(palette.court, palette.ink, amount);
  return {
    wall: m(0.05), pillar: m(0.08), step: [m(0.08), m(0.11), m(0.14), m(0.17)], edge: mix(palette.court, '#ffffff', 0.6),
    torso: [[m(0.15), m(0.18)], [m(0.19), m(0.22)], [m(0.23), m(0.26)], [m(0.27), m(0.3)]],
    face: [m(0.02), m(0.05)], hair: [m(0.34), m(0.38), m(0.3)], hat: m(0.42), eye: m(0.6), rail: m(0.28),
    board: m(0.3)
  };
};
const toneCache = new WeakMap();

function drawPerson(ctx, p, tones, gaze, raise, wave) {
  const { x, y, s } = p;
  const headY = y - 15 * s, r = 11 * s, w = 18 * s;
  const torso = tones.torso[p.row][p.shade], face = tones.face[p.face], hair = tones.hair[p.hair];
  if (raise > 0.01) {
    // The arm swings up from hanging at the side to up and a little outward, with a small wave while it is up.
    const swing = raise * 2.9 + Math.sin(wave + x) * 0.07 * raise;
    ctx.strokeStyle = torso;
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.fillStyle = face;
    for (const d of [-1, 1]) {
      const fromX = x + d * w * 0.7, fromY = y + 8 * s;
      const toX = fromX + d * Math.sin(swing) * 36 * s, toY = fromY + Math.cos(swing) * 36 * s;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(toX, toY - 2 * s * raise, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.style < 0.35) {
    ctx.fillStyle = hair;
    ctx.fillRect(x - r - 1.5 * s, headY - 2 * s, 2 * r + 3 * s, 26 * s);
  }
  ctx.fillStyle = torso;
  ctx.beginPath();
  ctx.moveTo(x - w, y + 44 * s);
  ctx.lineTo(x - w, y + 11 * s);
  ctx.quadraticCurveTo(x - w, y, x - w + 9 * s, y);
  ctx.lineTo(x + w - 9 * s, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 11 * s);
  ctx.lineTo(x + w, y + 44 * s);
  ctx.fill();
  ctx.fillStyle = face;
  ctx.fillRect(x - 4 * s, y - 6 * s, 8 * s, 9 * s);
  if (p.style >= 0.35 && p.style < 0.5) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(x, headY - r - s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, headY, r, 0, Math.PI * 2);
  ctx.fill();
  if (p.style < 0.85) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(x - r - 0.5 * s, headY - s);
    ctx.quadraticCurveTo(x - r, headY - r * 1.35, x, headY - r * 1.3);
    ctx.quadraticCurveTo(x + r, headY - r * 1.35, x + r + 0.5 * s, headY - s);
    ctx.quadraticCurveTo(x, headY - r * 0.55, x - r - 0.5 * s, headY - s);
    ctx.fill();
  }
  if (p.hat) {
    ctx.fillStyle = tones.hat;
    ctx.beginPath();
    ctx.moveTo(x - r - s, headY - 3 * s);
    ctx.quadraticCurveTo(x, headY - r * 1.8, x + r + s, headY - 3 * s);
    ctx.fill();
    ctx.fillRect(x - r - 5 * s, headY - 4 * s, 2 * r + 9 * s, 3 * s);
  }
  let lookX = 0, lookY = 0;
  if (gaze) {
    const dx = gaze.x - x, dy = gaze.y - headY, distance = Math.hypot(dx, dy) || 1;
    lookX = dx / distance * 1.8 * s;
    lookY = dy / distance * 1.8 * s;
  }
  ctx.fillStyle = tones.eye;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + d * 4 * s + lookX, headY + s + lookY, 1.7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const riseSeconds = 0.3;
const holdSeconds = 0.7;
const fallSeconds = 0.5;

// How far the arms are up, 0 to 1, `seconds` after the cheer began: up, held, then back down. At the end of a
// match (`finale`) they stay up.
export function cheerAmount(seconds, finale = false) {
  if (seconds <= 0) return 0;
  if (seconds < riseSeconds) return easeOut(seconds / riseSeconds);
  if (finale || seconds < riseSeconds + holdSeconds) return 1;
  const back = (seconds - riseSeconds - holdSeconds) / fallSeconds;
  return back >= 1 ? 0 : 1 - easeInOut(back);
}

// `cheer` is { side, since, finale } for the side that just scored, if any; only that side's crowd cheers.
export function drawStands(ctx, stands, gaze, palette, cheer, now = 0) {
  let tones = toneCache.get(palette);
  if (!tones) toneCache.set(palette, tones = tonesFor(palette));
  ctx.fillStyle = tones.wall;
  ctx.fillRect(0, 0, 900, standsBottom);
  ctx.fillStyle = tones.pillar;
  for (let k = 0; k < 7; k++) ctx.fillRect(40 + k * 130, 0, 6, 150);
  rows.forEach(([y, s], row) => {
    for (const p of stands.people) {
      if (p.row !== row) continue;
      const cheering = cheer && (p.x < 450) === (cheer.side === 'left') && (p.fan || cheer.finale);
      const raise = cheering ? cheerAmount((now - cheer.since) / 1000 - p.delay, cheer.finale) : 0;
      drawPerson(ctx, p, tones, gaze, raise, now / 160);
    }
    const top = y + 26 * s;
    ctx.fillStyle = tones.step[row];
    ctx.fillRect(30, top, 840, row < 3 ? 30 : 24);
    ctx.fillStyle = tones.edge;
    ctx.fillRect(30, top, 840, 3);
  });
  ctx.fillStyle = tones.rail;
  ctx.fillRect(24, 0, 8, standsBottom);
  ctx.fillRect(868, 0, 8, standsBottom);
  ctx.fillStyle = tones.board;
  ctx.fillRect(0, 152, 900, 26);
}
