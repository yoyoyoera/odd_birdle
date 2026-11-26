// AI glasses (?glasses=1): a recording mode, off unless the address asks for it. A neon HUD over the court draws where the
// shuttle is going to land (the game's own flight maths, game.predictFlight, which knows only normal play), a landing mark
// and how sure it is. When a random effect starts, the prediction is wrong and the HUD glitches: the lines shake and split,
// the words turn to ERROR. Everything here is drawing and timing; nothing changes how the game plays.
//
//   ?glasses=1                     on, random effects as usual
//   &effect=gust,decoy,bumper      only these effects, in this order (gust wind, decoy, bumper, trampoline, balloon,
//                                  freeze, shock, invisible, highnet, lownet), one per rally
//   &rally=2                       the rally the first one comes in (default 2: rally 1 is a clean one)
//   &after=2                       seconds into that rally (default 2)
//   &lang=ko                       Korean words

import { floor, leftLine, rightLine, width } from './game.js';
import { standsBottom } from './stands.js';

const effectNames = {
  gust: 'wind', wind: 'wind', decoy: 'decoy', bumper: 'bumper', trampoline: 'trampoline', balloon: 'balloon',
  freeze: 'freeze', shock: 'shock', invisible: 'invisible', highnet: 'highNet', lownet: 'lowNet'
};

export function parseGlasses(search = '') {
  const params = new URLSearchParams(search);
  if (params.get('glasses') !== '1') return { on: false };
  const number = (name, fallback, low) => {
    const value = Number(params.get(name));
    return params.has(name) && Number.isFinite(value) && value >= low ? value : fallback;
  };
  return {
    on: true,
    effects: (params.get('effect') ?? '').toLowerCase().split(',').map(name => effectNames[name.trim()]).filter(Boolean),
    rally: Math.floor(number('rally', 2, 1)),
    after: number('after', 2, 0),
    lang: params.get('lang') === 'ko' ? 'ko' : 'en'
  };
}

// Brings the chosen effects in on time. `update` is called every frame with the game's view; `trigger(id)` starts one
// (true when it did). One effect per rally, in order, none before rally `rally` and `after` seconds into it.
export function createGlassesScript({ effects = [], rally = 2, after = 2 } = {}) {
  let next = 0;
  let lastTotal = 0;
  let rallyTime = 0;
  let firedIn = 0;
  return {
    get pending() { return effects.length - next; },
    reset() { next = 0; lastTotal = 0; rallyTime = 0; firedIn = 0; },
    update(view, seconds, trigger) {
      if (!effects.length) return;
      const total = view.score ? view.score.left + view.score.right : 0;
      if (total < lastTotal) { next = 0; firedIn = 0; }
      if (total !== lastTotal) { lastTotal = total; rallyTime = 0; }
      if (view.phase !== 'live') return;
      rallyTime += seconds;
      const number = total + 1;
      if (next < effects.length && !view.effect && number >= rally && number > firedIn && rallyTime >= after &&
          trigger(effects[next])) {
        next++;
        firedIn = number;
      }
    }
  };
}

export const glassesText = {
  en: {
    boot: 'AI GLASSES ONLINE', tag: 'AI GLASSES', in: 'IN', out: 'OUT', net: 'NET',
    glitch: ['AI: ???', 'ERROR', 'RECALCULATING…'], alerts: ['ERROR', 'RECALCULATING…'], targets: count => `TARGETS: ${count}`
  },
  ko: {
    boot: 'AI 안경 연결됨', tag: 'AI 안경', in: '인', out: '아웃', net: '네트',
    glitch: ['AI: ???', '오류', '재계산 중…'], alerts: ['오류', '재계산 중…'], targets: count => `표적 ${count}개`
  }
};

// Where it comes down: 'in' (inside the lines), 'out' or 'net'.
export function callOf(landing) {
  if (landing?.net) return 'net';
  return landing && (landing.x < leftLine || landing.x > rightLine) ? 'out' : 'in';
}

// How sure the glasses say they are: always high in normal play, a little different for each shot, less near a line.
export function confidence(flight = 0, landing) {
  const base = [99, 98, 99, 97, 99, 96][Math.abs(Math.floor(flight)) % 6];
  const near = landing && Math.min(Math.abs(landing.x - leftLine), Math.abs(landing.x - rightLine)) < 25;
  return near ? base - 7 : base;
}

export function labelText(lang, landing, flight) {
  const words = glassesText[lang] ?? glassesText.en;
  return `AI: ${confidence(flight, landing)}% ${words[callOf(landing)]}`;
}

// The word the glitch shows right now: it changes every `every` ms.
export function glitchText(lang, now, every = 420, list) {
  const words = list ?? (glassesText[lang] ?? glassesText.en).glitch;
  return words[Math.floor(now / every) % words.length];
}

const NEON = '#19f0ff';
const ALERT = '#ff3fb4';
const HALO = '#06141c';
const noise = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
const font = size => `650 ${size}px "Space Grotesk", system-ui, sans-serif`;

function polyline(ctx, points, { color, line, alpha = 1, dash, offset = 0 }) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = offset; }
  const trace = () => {
    ctx.beginPath();
    points.forEach((point, i) => (i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.stroke();
  };
  ctx.strokeStyle = HALO;
  ctx.lineWidth = line * 2.1;
  ctx.globalAlpha = alpha * 0.55;
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.globalAlpha = alpha;
  trace();
  ctx.restore();
}

function target(ctx, x, y, radius, line, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  const ring = () => { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); };
  const cross = () => {
    ctx.beginPath();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.moveTo(x + dx * radius * 0.45, y + dy * radius * 0.45);
      ctx.lineTo(x + dx * radius * 1.6, y + dy * radius * 1.6);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = HALO;
  ctx.lineWidth = line * 2.1;
  ring(); cross();
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ring(); cross();
  ctx.restore();
}

function chip(ctx, text, x, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font(size);
  const boxWidth = ctx.measureText(text).width + size * 1.2;
  const boxHeight = size * 1.75;
  const left = Math.max(6, Math.min(width - boxWidth - 6, x - boxWidth / 2));
  ctx.fillStyle = 'rgba(6, 20, 28, .8)';
  ctx.fillRect(left, y - boxHeight / 2, boxWidth, boxHeight);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.strokeRect(left, y - boxHeight / 2, boxWidth, boxHeight);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + boxWidth / 2, y + size * 0.06);
  ctx.restore();
}

function brackets(ctx, inset, long, line, color, alpha = 1) {
  const [left, top] = [inset.x, inset.y];
  const [right, bottom] = [width - inset.x, floor + 40 - inset.y];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'square';
  const draw = () => {
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]]) {
      ctx.moveTo(x + dx * long, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * long);
    }
    ctx.stroke();
  };
  ctx.strokeStyle = HALO;
  ctx.lineWidth = line * 2.1;
  draw();
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  draw();
  ctx.restore();
}

// Draws the HUD. `px(n)` turns n screen pixels into court units (so lines stay thick on a small phone), `mx(x)` maps a
// court x to where it is drawn (the court can be shown mirrored). `effectAge` is how long the running effect has run (s).
export function drawGlasses(ctx, { now, prediction, view, effectAge = 0, bootAge = Infinity, lang = 'en', px, mx }) {
  const words = glassesText[lang] ?? glassesText.en;
  const unit = Math.max(17, Math.min(30, px(13)));
  const line = Math.max(3.5, px(4));
  const effect = view.effect;
  const glitch = Boolean(effect);
  const booting = bootAge < 1.9;
  ctx.save();
  ctx.textBaseline = 'middle';

  // Frame corners (they close in while the glasses start up) and a slow scan line.
  const settle = Math.min(1, bootAge / 0.7);
  const ease = 1 - (1 - settle) ** 3;
  brackets(ctx, { x: px(10) + (1 - ease) * width * 0.26, y: px(10) + (1 - ease) * 120 }, Math.max(26, px(26)), Math.max(3, px(3)),
    glitch && Math.floor(now / 90) % 3 === 0 ? ALERT : NEON, 0.95);
  const sweep = booting ? (bootAge / 0.9) % 1 : (now / 2600) % 1;
  ctx.globalAlpha = booting ? 0.5 : 0.2;
  ctx.fillStyle = NEON;
  ctx.fillRect(0, sweep * (floor + 40), width, Math.max(2, px(2)));
  ctx.globalAlpha = 1;
  chip(ctx, words.tag, px(10) + unit * 3.4, floor + 24, unit * 0.62, glitch ? ALERT : NEON, 0.9);

  if (booting) {
    const fade = bootAge > 1.5 ? 1 - (bootAge - 1.5) / 0.4 : 1;
    const typed = words.boot.slice(0, Math.ceil(words.boot.length * Math.min(1, bootAge / 1.1)));
    chip(ctx, typed + (Math.floor(now / 160) % 2 ? '▮' : ''), width / 2, standsBottom + unit * 1.4, unit * 1.05, NEON, Math.max(0, fade));
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = HALO;
    ctx.fillRect(width / 2 - px(90), standsBottom + unit * 2.7, px(180), Math.max(4, px(5)));
    ctx.fillStyle = NEON;
    ctx.fillRect(width / 2 - px(90), standsBottom + unit * 2.7, px(180) * Math.min(1, bootAge / 1.5), Math.max(4, px(5)));
    ctx.globalAlpha = 1;
  }

  const incoming = prediction && view.phase === 'live' && prediction.lastHitter !== 'left';
  if (incoming && prediction.shuttle) {
    const flight = view.shuttle?.flight ?? prediction.flight;
    const marchDash = [px(14), px(9)];
    const lines = [{ ...prediction.shuttle, real: true }];
    if (effect === 'decoy') lines.push(...prediction.decoys.map(entry => ({ ...entry, real: false })));
    const flash = glitch && effectAge < 0.3 && Math.floor(now / 55) % 2 === 0;
    if (flash) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = ALERT;
      ctx.fillRect(0, 0, width, floor + 40);
      ctx.globalAlpha = 1;
    }
    lines.forEach((entry, k) => {
      const points = entry.path.map(point => ({ x: mx(point.x), y: point.y }));
      if (glitch && effect !== 'decoy') {
        // Wrong, and not even sure of itself: three copies that shake, break up and flicker between the two colours.
        for (let copy = 0; copy < 3; copy++) {
          const shaken = points.map((point, i) => ({
            x: point.x + (noise(i + copy * 7, Math.floor(now / 70) + copy) - 0.5) * px(30 + copy * 8),
            y: point.y + (noise(i + 3, Math.floor(now / 85) + copy * 5) - 0.5) * px(22)
          }));
          const cut = Math.floor(shaken.length * (0.55 + 0.45 * noise(copy, Math.floor(now / 140))));
          polyline(ctx, shaken.slice(0, Math.max(2, cut)), {
            color: copy === 1 ? NEON : ALERT, line: line * (copy === 0 ? 1 : 0.7), alpha: 0.5 + 0.5 * noise(copy, Math.floor(now / 60)),
            dash: [px(10 + copy * 6), px(8)], offset: -now / 22 * (copy + 1)
          });
        }
      } else {
        polyline(ctx, points, { color: NEON, line, dash: marchDash, offset: -now / 18 });
      }
      const land = entry.landing;
      if (!land) return;
      const tx = mx(land.x);
      const ty = floor - 2;
      if (glitch && effect !== 'decoy') {
        // The landing mark cannot make up its mind.
        for (let ghost = 0; ghost < 3; ghost++) {
          const jump = (noise(ghost, Math.floor(now / 110)) - 0.5) * px(150);
          target(ctx, Math.max(px(20), Math.min(width - px(20), tx + jump)), ty, unit * 0.75, line * 0.8, ghost === 1 ? NEON : ALERT, 0.5 + 0.4 * noise(ghost + 5, Math.floor(now / 90)));
        }
        chip(ctx, glitchText(lang, now + k * 140), tx, floor - unit * 2.7, unit, ALERT);
      } else {
        target(ctx, tx, ty, unit * 0.85, line, NEON);
        chip(ctx, labelText(lang, land, flight + k), tx, floor - unit * (2.7 + k * 2.1), unit, NEON);
      }
    });
    if (effect === 'decoy') chip(ctx, words.targets(lines.length), width / 2, standsBottom + unit * 1.4, unit * 1.05, ALERT);
  }
  if (glitch && effect !== 'decoy') {
    chip(ctx, glitchText(lang, now, 700, words.alerts), width / 2, standsBottom + unit * 1.4, unit * 1.05, ALERT, 0.65 + 0.35 * noise(1, Math.floor(now / 80)));
  }
  ctx.restore();
}
