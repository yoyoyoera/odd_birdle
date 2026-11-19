// The full-time card: a 1080x1350 picture of a finished match, drawn on a canvas in the match's own colours.
// Crowd, a crowned (when won) racket, the score plate, a few facts and one line. Everything is seeded, so the same
// match always draws the same card; a different seed gives different confetti and a different crowd.
import { makeStands, drawStands } from './stands.js';
import { shuttleOutline } from './game.js';

export const cardWidth = 1080, cardHeight = 1350;

function randomFrom(seed) {
  let state = (Math.floor(seed) % 2147483646) + 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

const font = (size, weight = 650) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The star of the card is the match's own odd shuttle, drawn the way the game draws it: a flat silhouette in the ink
// colour. The winner's wears a crown; the loser's lies tipped over on the floor.
function heroShuttle(ctx, palette, { shape, size, x, y, angle, crown }) {
  const rings = shuttleOutline({ shape, size, angle });
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((point, index) => index ? ctx.lineTo(x + point.x, y + point.y) : ctx.moveTo(x + point.x, y + point.y));
    ctx.closePath();
  }
  ctx.fillStyle = palette.ink;
  ctx.fill('evenodd');
  if (crown) {
    const top = y + Math.min(...rings.flat().map(point => point.y));
    const w = size * 0.8, h = size * 0.42, base = top + 4;
    ctx.fillStyle = '#e9c25a'; ctx.strokeStyle = palette.ink; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base); ctx.lineTo(x - w / 2, base - h * 0.6); ctx.lineTo(x - w / 4, base - h * 0.25);
    ctx.lineTo(x, base - h); ctx.lineTo(x + w / 4, base - h * 0.25); ctx.lineTo(x + w / 2, base - h * 0.6);
    ctx.lineTo(x + w / 2, base); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function confetti(ctx, palette, random, count, width, top, bottom) {
  const colors = [palette.ink, palette.net, palette.line, '#dcb49c', '#a9d678', '#e9c25a'];
  for (let k = 0; k < count; k++) {
    ctx.save();
    ctx.translate(random() * width, top + random() * (bottom - top));
    ctx.rotate(random() * Math.PI);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-8, -4, 16 + random() * 8, 8);
    ctx.restore();
  }
}

function drizzle(ctx, palette, random, width, top, bottom) {
  ctx.strokeStyle = palette.ink + '66';
  ctx.lineWidth = 3;
  for (let k = 0; k < 110; k++) {
    const x = random() * width, y = top + random() * (bottom - top);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 34); ctx.stroke();
  }
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(' '), rows = [];
  let row = '';
  for (const word of words) {
    const next = row ? row + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

// match: { won, mine, theirs, cpuLevel, stage, rally, effects: [['SHOCK', 3], ...], line, name, seed, palette }
export function drawCard(ctx, match) {
  const { palette, won, mine, theirs, cpuLevel, stage, rally, effects = [], line, name, seed = 1, shape = 0 } = match;
  const random = randomFrom(seed);
  const W = cardWidth, H = cardHeight;
  ctx.fillStyle = palette.page;
  ctx.fillRect(0, 0, W, H);

  // Scene: the match's court, with the crowd big enough to see their faces.
  const sceneBottom = 840;
  ctx.fillStyle = palette.court;
  ctx.fillRect(0, 0, W, sceneBottom);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, sceneBottom); ctx.clip();
  const scale = 2.3;
  ctx.translate(W / 2 - 450 * scale, 0);
  ctx.scale(scale, scale);
  drawStands(ctx, makeStands(seed), { palette, now: 4000, cheer: { side: won ? 'left' : 'right', since: 0, finale: true }, mood: { effect: undefined, effectAge: 0, wind: 0, standing: won ? 1 : 0, surprise: 0, clock: seed * 1000 } });
  ctx.restore();
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 640, W, sceneBottom - 640);
  ctx.fillStyle = palette.line;
  ctx.fillRect(0, 640, W, 10);
  if (won) confetti(ctx, palette, random, 90, W, 380, sceneBottom);
  else drizzle(ctx, palette, random, W, 0, sceneBottom);
  heroShuttle(ctx, palette, { shape, size: won ? 125 : 105, x: W / 2, y: won ? 600 : 690, angle: won ? -0.15 : 0.9, crown: won });
  ctx.fillStyle = palette.ink + '33';
  ctx.beginPath(); ctx.ellipse(W / 2, won ? 770 : 780, won ? 130 : 150, 20, 0, 0, Math.PI * 2); ctx.fill();

  // Score plate.
  const plateY = 880, plateH = 190, plateX = 70, plateW = W - 140;
  roundRect(ctx, plateX, plateY, plateW, plateH, 34);
  const fill = ctx.createLinearGradient(plateX, 0, plateX + plateW, 0);
  fill.addColorStop(0, palette.court); fill.addColorStop(1, palette.floor);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = palette.ink; ctx.stroke();
  roundRect(ctx, W / 2 - 130, plateY - 30, 260, 54, 27);
  ctx.fillStyle = palette.ink; ctx.fill();
  ctx.fillStyle = palette.court; ctx.font = font(30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FULL-TIME', W / 2, plateY - 2);
  ctx.fillStyle = palette.ink; ctx.font = font(124, 650);
  ctx.fillText(`${mine}:${theirs}`, W / 2, plateY + 104);
  ctx.fillStyle = palette.ink; ctx.textAlign = 'center';
  ctx.font = font(44); ctx.fillText('YOU', plateX + 120, plateY + 108);
  ctx.font = font(36); ctx.fillText(`CPU LV.${cpuLevel}`, plateX + plateW - 140, plateY + 108);

  // Facts.
  const facts = [];
  if (stage) facts.push(`STAGE ${stage}`);
  if (rally) facts.push(`LONGEST RALLY ${rally}`);
  // However many kinds of effect fired, the card names only the busiest two and counts the rest.
  const byCount = [...effects].sort((a, b) => b[1] - a[1]);
  if (byCount.length <= 2) for (const [effect, times] of byCount) facts.push(`${effect} ×${times}`);
  else facts.push(`${byCount.length} EFFECTS`, `MOST: ${byCount[0][0]} ×${byCount[0][1]}`);
  ctx.fillStyle = palette.court; ctx.font = font(30); ctx.textAlign = 'center';
  ctx.globalAlpha = 0.85;
  ctx.fillText(facts.join('  ·  '), W / 2, 1122);
  ctx.globalAlpha = 1;

  // The line.
  ctx.fillStyle = palette.court; ctx.font = font(58); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const rows = wrap(ctx, line, W - 160);
  rows.forEach((row, index) => ctx.fillText(row, W / 2, 1200 + index * 66));

  // Side title and signature.
  ctx.save();
  ctx.translate(W - 28, 40); ctx.rotate(Math.PI / 2);
  ctx.fillStyle = palette.ink; ctx.font = font(34); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('ODD BIRDLE', 0, 0);
  ctx.restore();
  if (name) { ctx.fillStyle = palette.court; ctx.globalAlpha = 0.6; ctx.font = font(26); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(name, 48, H - 24); ctx.globalAlpha = 1; }
}
