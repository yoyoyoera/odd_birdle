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

// Who someone is, beyond where they sit: the side they support (most back the half they sit by, some the other one,
// some nobody), how big their reactions are, and how they show it. From a second stream of the same seed, so the
// seats themselves come out exactly as before.
export const joyMoves = ['arms', 'clap', 'jump'];
function personality(random, x) {
  const near = x < 450 ? 'left' : 'right';
  const far = near === 'left' ? 'right' : 'left';
  const roll = random();
  return {
    team: roll < 0.58 ? near : roll < 0.8 ? far : 'neutral',
    // 0.35 (hardly moves) to 1.6 (all in).
    energy: 0.35 + random() ** 1.3 * 1.25,
    joy: joyMoves[Math.min(2, Math.floor(random() * 3))],
    // When their side loses a point: slump, or hands on the head.
    grief: random() < 0.6 ? 'slump' : 'head'
  };
}

export function makeStands(seed = Math.random() * 2147483646, fullness) {
  const random = randomFrom(seed);
  const traits = randomFrom((Math.floor(seed) * 7919 + 17) % 2147483646);
  // `fullness` (0 to 1) fixes how packed the stands are; the game leaves it random, the full-time card packs them.
  const fill = fullness ?? 0.3 + random() * 0.7;
  const people = [];
  rows.forEach(([y, s], row) => {
    for (let x = 60 + (row % 2) * 26 + random() * 10; x < 850; x += 50 * s + random() * 14) {
      const person = {
        x: x + (random() - 0.5) * 6, y, s, row, shade: random() < 0.5 ? 0 : 1, face: random() < 0.5 ? 0 : 1,
        hair: Math.floor(random() * 3), style: random(), hat: random() < 0.1, fan: random() < 0.6, stand: random() < 0.7, delay: random() * 0.18
      };
      const seated = random() < fill;
      Object.assign(person, personality(traits, person.x));
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
    face: [m(0.02), m(0.05)], hair: [m(0.34), m(0.38), m(0.3)], hat: m(0.6), eye: m(0.6), rail: m(0.28),
    board: m(0.3), cold: '#bcd8ea'
  };
};
const toneCache = new WeakMap();

function drawPerson(ctx, p, tones, look) {
  const { x, y, s } = p;
  const { raise, boo, droop, clock, lean, gaze, duck, clap = 0, hold = 0 } = look;
  const headY = y - 15 * s, r = 11 * s, w = 18 * s;
  const torso = tones.torso[p.row][p.shade], face = tones.face[p.face], hair = tones.hair[p.hair];
  // The head and what sits on it turn together, around the neck.
  const tilted = draw => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
  };
  const protesting = boo > 0.01;
  if (raise > 0.01 || protesting) {
    // A cheer waves overhead. A protest lifts the hand nearest the middle of the court.
    const swing = raise * 2.9 + Math.sin(clock / 160 + x) * 0.07 * raise;
    ctx.strokeStyle = torso;
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.fillStyle = face;
    for (const d of protesting ? [x < 450 ? 1 : -1] : [-1, 1]) {
      const fromX = x + d * w * 0.7, fromY = y + 8 * s;
      const toX = protesting ? fromX + d * (5 + 10 * boo) * s : fromX + d * Math.sin(swing) * 36 * s;
      const toY = protesting ? fromY + (17 - 23 * boo) * s : fromY + Math.cos(swing) * 36 * s;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      if (protesting) ctx.lineTo(fromX + d * 8 * boo * s, fromY + 9 * s);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(toX, toY - 2 * s * raise, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.style < 0.35) {
    tilted(() => {
      ctx.fillStyle = hair;
      ctx.fillRect(x - r - 0.5 * s, headY - 2 * s, 2 * r + 1 * s, 26 * s);
    });
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
  tilted(() => {
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
      ctx.ellipse(x, headY - 5 * s, r + 0.5 * s, r * 0.85, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - r - 2.5 * s, headY - 6 * s, 2 * r + 5 * s, 2.5 * s);
    }
    let lookX = 0, lookY = 0;
    if (gaze) {
      const dx = gaze.x - x, dy = gaze.y - headY, distance = Math.hypot(dx, dy) || 1;
      lookX = dx / distance * 1.8 * s;
      lookY = dy / distance * 1.8 * s;
    }
    lookY += 1.6 * s * droop;
    ctx.fillStyle = tones.eye;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + d * 4 * s + lookX, headY + s + lookY, 1.7 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  if (clap > 0.01) {
    // Clapping in front of the chest: the hands meet and part on the person's own beat.
    const open = 0.5 + 0.5 * Math.sin(clock / 55 + x * 0.3);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, clap * 3);
    ctx.strokeStyle = torso;
    ctx.fillStyle = face;
    ctx.lineWidth = 5 * s;
    ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      const handX = x + d * (2.5 + 6 * open) * s, handY = y + (12 - 9 * clap) * s;
      ctx.beginPath();
      ctx.moveTo(x + d * 13 * s, y + 12 * s);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handX, handY, 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Hands on the head (their side lost the point) uses the same arms as ducking under a bomb, without the body going down.
  const cover = Math.max(duck, hold);
  if (cover > 0.001) {
    const duck = cover;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (duck - 0.001) * 6);
    ctx.strokeStyle = torso;
    ctx.fillStyle = face;
    ctx.lineWidth = 5 * s;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const elbowX = x + side * 17 * s;
      const handX = x + side * (17 - 7 * duck) * s;
      const handY = y + (8 - 26 * duck) * s;
      ctx.beginPath();
      ctx.moveTo(x + side * 12 * s, y + 10 * s);
      ctx.lineTo(elbowX, y + 8 * s);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handX, handY, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

const easeOut = t => 1 - (1 - t) ** 3;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const cheerTiming = { rise: 0.3, hold: 0.7, fall: 0.5 };
const droopTiming = { rise: 0.4, hold: 1.1, fall: 0.8 };
const booTiming = { rise: 0.15, hold: 0.24, fall: 0.24 };
const booSpectators = new WeakMap();

// How far a reaction has gone, 0 to 1, `seconds` after it began: eased up, held, then eased back. At the end of a
// match (`finale`) it stays up.
export function cheerAmount(seconds, finale = false, timing = cheerTiming) {
  if (seconds <= 0) return 0;
  if (seconds < timing.rise) return easeOut(seconds / timing.rise);
  if (finale || seconds < timing.rise + timing.hold) return 1;
  const back = (seconds - timing.rise - timing.hold) / timing.fall;
  return back >= 1 ? 0 : 1 - easeInOut(back);
}

const noMood = { effect: undefined, effectAge: 0, wind: 0, standing: 0, surprise: 0, clock: 0 };

// Ease toward each target in two passes so reversing direction carries the current motion through the turn.
export function createBombCrowdMotion() {
  const motion = { left: 0, right: 0 };
  const duck = { left: 0, right: 0 };
  let lastFrame;
  return {
    update(now, bombX) {
      const elapsed = Math.max(0, Math.min(50, now - (lastFrame ?? now)));
      lastFrame = now;
      const bombSide = bombX === undefined ? undefined : bombX < 450 ? 'left' : 'right';
      for (const side of ['left', 'right']) {
        const target = side === bombSide ? 1 : 0;
        const time = elapsed / (target ? 75 : 105);
        const decay = Math.exp(-time);
        const offset = motion[side] - target;
        duck[side] = target + (duck[side] - target + offset * time) * decay;
        motion[side] = target + offset * decay;
      }
      return duck;
    }
  };
}

export function bombDuckAmount(person, progress) {
  const amount = progress?.[person.x < 450 ? 'left' : 'right'] ?? 0;
  // Seats react at slightly different times and reverse smoothly from their current pose.
  const delayed = Math.max(0, amount - person.delay) / (1 - person.delay);
  return easeInOut(delayed);
}

// Draws the stands. `cheer` is { side, since, finale } for the side that just scored: that side's crowd cheers and
// the other side sinks a little. `boo` marks the side that broke the touch limit. `mood` carries the effect running, the rally's standing crowd and
// the crowd's own clock; `jolt` is the SHOCK flinch.
// How hard the crowd flinches at SHOCK (px at full jolt, before scale): sideways shake, sinking, shake speed.
// A little stronger than before (was 2.2 / 6 / 22 ms; tuned up again after a first bump was too faint to see); reduced motion turns the jolt off in client.js.
export const joltPower = { shake: 7, drop: 15, period: 14 };

// DECOY: which of the shuttles this person is looking at right now. Everyone flicks between them on their own
// beat, so the crowd looks muddled.
export function gazeTarget(person, now, count) {
  const slot = Math.floor(now / 330 + person.x * 0.071 + (person.row ?? 0) * 1.37);
  return Math.abs(Math.imul(slot + Math.round(person.x), 2654435761) >>> 0) % count;
}

function spectatorsForBoo(stands, boo) {
  const current = booSpectators.get(boo);
  if (current) return current;
  // Keep the same few seats reacting for the entire point without consuming gameplay randomness.
  const random = randomFrom(Math.imul(Math.floor(boo.since), 2654435761) >>> 0);
  const seats = stands.people.filter(person => person.fan && (person.x < 450) === (boo.side === 'left'));
  const count = Math.min(seats.length, Math.floor(random() * 5));
  const selected = new Set();
  for (let i = 0; i < count; i++) {
    const index = Math.floor(random() * seats.length);
    selected.add(seats.splice(index, 1)[0]);
  }
  booSpectators.set(boo, selected);
  return selected;
}

export function drawStands(ctx, stands, { gaze, gazes, palette, cheer, boo, now = 0, jolt = 0, mood = noMood, bombDuck }) {
  let tones = toneCache.get(palette);
  if (!tones) toneCache.set(palette, tones = tonesFor(palette));
  const { effect, effectAge, wind, standing, surprise, clock, tension = 0, wave } = mood;
  const reacting = boo && spectatorsForBoo(stands, boo);
  const blend = Math.min(1, effectAge / 250);
  ctx.fillStyle = tones.wall;
  ctx.fillRect(0, 0, 900, standsBottom);
  ctx.fillStyle = tones.pillar;
  for (let k = 0; k < 7; k++) ctx.fillRect(40 + k * 130, 0, 6, 150);
  rows.forEach(([y, s], row) => {
    // People are drawn only down to the top of their step, so sinking or jolting never pushes a body out below it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 900, y + 26 * s);
    ctx.clip();
    for (const p of stands.people) {
      if (p.row !== row) continue;
      // Each person backs a side (or nobody): their side's point is joy, the other side's is grief.
      const team = p.team ?? (p.x < 450 ? 'left' : 'right');
      const seconds = cheer ? (now - cheer.since) / 1000 - p.delay : 0;
      const duck = bombDuckAmount(p, bombDuck);
      const booSeconds = reacting?.has(p) ? (now - boo.since) / 1000 - p.delay : 0;
      const protest = cheerAmount(booSeconds, false, booTiming) * (1 - duck);
      const fanOf = cheer && team === cheer.side;
      const rival = cheer && team !== 'neutral' && !fanOf;
      // A comeback lifts everyone on that side, the quiet ones too.
      const energy = cheer?.big ? Math.max(p.energy ?? 1, 1.25) : p.energy ?? 1;
      const amount = cheer ? cheerAmount(seconds, cheer.finale) * (1 - duck) : 0;
      const joyful = fanOf && (p.fan || cheer.finale || cheer.big) ? amount
        : team === 'neutral' && (cheer?.finale || cheer?.big) ? amount * 0.6 : 0;
      const move = team === 'neutral' ? 'clap' : p.joy ?? 'arms';
      let raise = 0, clap = 0, jump = 0;
      if (move === 'arms') raise = joyful * Math.min(1, 0.5 + energy * 0.45);
      else if (move === 'clap') clap = joyful;
      else { jump = joyful * energy; raise = joyful * 0.7; }
      const sad = rival ? cheerAmount(seconds, cheer.finale, droopTiming) * (1 - protest) * Math.min(1.3, energy) : 0;
      const hold = p.grief === 'head' ? Math.min(1, sad) * (1 - duck) : 0;
      const droop = p.grief === 'head' ? sad * 0.4 : sad;
      // The wave: a bump running left to right; whoever it passes stands and throws their arms up.
      const swell = wave === undefined ? 0 : Math.exp(-(((p.x - (-120 + wave * 1140)) / 75) ** 2)) * (1 - duck);
      raise = Math.max(raise, swell * 0.95);
      // Match point: everyone stops swaying and leans in.
      let dx = 0, dy = Math.sin(clock / 650 + p.x * 0.05) * 0.8 * s * (1 - tension * 0.85);
      if (jolt > 0) { dx += Math.sin(now / joltPower.period + p.x) * joltPower.shake * jolt * s; dy += jolt * joltPower.drop * s; }
      dy += (droop * 5 - surprise * 3 - protest * 1.4 + tension * 3.5 - jump * 9 - swell * 11) * s;
      if (p.stand) dy -= standing * (12 + Math.abs(Math.sin(clock / 170 + p.x)) * 3) * s;
      dy += duck * 29 * s;
      let tilt = 0;
      if (effect === 'wind') {
        tilt = wind * (0.11 * blend + Math.sin(clock / 80 + p.x) * 0.025);
        dx += wind * 3 * s * blend;
      }
      let look = gazes?.length > 1 ? gazes[gazeTarget(p, now, gazes.length)] : gaze;
      let lean = (p.x < 450 ? -0.18 : 0.18) * duck;
      if (effect === 'balloon') look = { x: p.x, y: -400 };
      if (effect === 'invisible' && gaze) lean = Math.max(-0.32, Math.min(0.32, (gaze.x - p.x) / 500 * 0.5));
      lean += Math.sin(booSeconds * 18) * 0.09 * protest;
      ctx.save();
      ctx.translate(p.x + dx, y + 40 * s + dy);
      ctx.rotate(tilt);
      ctx.translate(-p.x, -(y + 40 * s));
      drawPerson(ctx, p, tones, {
        raise, boo: protest, droop, clock, lean, gaze: look, duck, clap, hold
      });
      ctx.restore();
    }
    ctx.restore();
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
  if (effect === 'freeze') {
    ctx.globalAlpha = 0.3 * blend;
    ctx.fillStyle = tones.cold;
    ctx.fillRect(0, 0, 900, standsBottom);
    ctx.globalAlpha = 1;
  }
}
